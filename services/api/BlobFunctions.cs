using System.Net;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;

public sealed class BlobFiles
{
    private const long MaxFileBytes = 15 * 1024 * 1024;
    private readonly string _connection = TokenValidator.Required("AzureWebJobsStorage");
    private readonly string _containerName = Environment.GetEnvironmentVariable("BLOB_CONTAINER") ?? "church-resources";

    public async Task<BlobContainerClient> ContainerAsync(CancellationToken cancellationToken)
    {
        var container = new BlobServiceClient(_connection).GetBlobContainerClient(_containerName);
        await container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: cancellationToken);
        return container;
    }

    public async Task UploadAsync(string id, Stream content, string fileName, string contentType, CancellationToken cancellationToken)
    {
        var extension = Path.GetExtension(fileName).ToLowerInvariant();
        var allowedTypes = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            [".mp3"] = "audio/mpeg", [".m4a"] = "audio/mp4", [".mp4"] = "video/mp4",
            [".pdf"] = "application/pdf", [".jpg"] = "image/jpeg", [".jpeg"] = "image/jpeg", [".png"] = "image/png"
        };
        if (!allowedTypes.TryGetValue(extension, out var expectedType) ||
            !contentType.Split(';')[0].Trim().Equals(expectedType, StringComparison.OrdinalIgnoreCase))
            throw new ArgumentException("Tipo de archivo no permitido. Use MP3, M4A, MP4, PDF, JPEG o PNG.");
        var container = await ContainerAsync(cancellationToken);
        var blob = container.GetBlobClient($"{Guid.Parse(id):N}/{Guid.NewGuid():N}");
        await blob.UploadAsync(content, new BlobUploadOptions
        {
            HttpHeaders = new BlobHttpHeaders { ContentType = contentType },
            Metadata = new Dictionary<string, string> { ["original-name"] = Sanitize(fileName) }
        }, cancellationToken);
        await SaveMetadataAsync(id, blob.Name, Sanitize(fileName), contentType, cancellationToken);
    }

    public async Task<(Stream Content, string ContentType, string FileName)?> DownloadAsync(string id, CancellationToken cancellationToken)
    {
        var blobName = await ReadBlobNameAsync(id, cancellationToken);
        if (blobName is null) return null;
        var container = await ContainerAsync(cancellationToken);
        var blob = container.GetBlobClient(blobName);
        if (!await blob.ExistsAsync(cancellationToken)) return null;
        var download = await blob.DownloadStreamingAsync(cancellationToken: cancellationToken);
        return (download.Value.Content, download.Value.Details.ContentType ?? "application/octet-stream",
            download.Value.Details.Metadata.TryGetValue("original-name", out var name) ? name : "recurso");
    }

    public static long MaximumFileBytes => MaxFileBytes;

    private static async Task SaveMetadataAsync(string id, string blob, string name, string contentType, CancellationToken cancellationToken)
    {
        await using var connection = new Npgsql.NpgsqlConnection(TokenValidator.Required("DATABASE_URL"));
        await connection.OpenAsync(cancellationToken);
        await using var command = new Npgsql.NpgsqlCommand("""
            UPDATE resources SET blob_name = @blob, file_name = @name, content_type = @type, updated_at = now()
            WHERE id = @id
            """, connection);
        command.Parameters.AddWithValue("blob", blob);
        command.Parameters.AddWithValue("name", name);
        command.Parameters.AddWithValue("type", contentType);
        command.Parameters.AddWithValue("id", Guid.Parse(id));
        if (await command.ExecuteNonQueryAsync(cancellationToken) == 0) throw new KeyNotFoundException("Recurso no encontrado.");
    }

    private static async Task<string?> ReadBlobNameAsync(string id, CancellationToken cancellationToken)
    {
        await using var connection = new Npgsql.NpgsqlConnection(TokenValidator.Required("DATABASE_URL"));
        await connection.OpenAsync(cancellationToken);
        await using var command = new Npgsql.NpgsqlCommand("SELECT blob_name FROM resources WHERE id = @id", connection);
        command.Parameters.AddWithValue("id", Guid.Parse(id));
        return await command.ExecuteScalarAsync(cancellationToken) as string;
    }

    private static string Sanitize(string value)
    {
        var name = Path.GetFileName(value);
        var safe = new string(name.Where(c => char.IsLetterOrDigit(c) || c is '.' or '-' or '_').Take(120).ToArray());
        return string.IsNullOrWhiteSpace(safe) ? "recurso" : safe;
    }
}

public sealed class BlobFunctions
{
    private readonly TokenValidator _tokens;
    private readonly BlobFiles _files;
    public BlobFunctions(TokenValidator tokens, BlobFiles files) { _tokens = tokens; _files = files; }

    [Function("ResourceFile")]
    public async Task<HttpResponseData> ResourceFile([HttpTrigger(AuthorizationLevel.Anonymous,     "get", "put", "options",
        Route = "resources/{id}/content")] HttpRequestData request, string id, CancellationToken cancellationToken)
    {
    if (request.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
        return AddCors(request.CreateResponse(HttpStatusCode.NoContent));
        var principal = await _tokens.ValidateAsync(request.Headers.TryGetValues("Authorization", out var values)
            ? values.FirstOrDefault() : null, cancellationToken);
        if (principal is null) return await Fail(request, HttpStatusCode.Unauthorized, "Se requiere una sesión válida.");
        if (!principal.IsInRole("Admin")) return await Fail(request, HttpStatusCode.Forbidden, "No tiene permiso para acceder a archivos.");
        if (!Guid.TryParse(id, out _)) return await Fail(request, HttpStatusCode.BadRequest, "Identificador no válido.");

        try
        {
            if (request.Method.Equals("PUT", StringComparison.OrdinalIgnoreCase))
            {
                await using var bounded = new MemoryStream();
                var buffer = new byte[81920];
                int read;
                while ((read = await request.Body.ReadAsync(buffer, cancellationToken)) > 0)
                {
                    if (bounded.Length + read > BlobFiles.MaximumFileBytes)
                        return await Fail(request, HttpStatusCode.RequestEntityTooLarge, "El archivo supera el límite de 15 MB.");
                    await bounded.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                }
                bounded.Position = 0;
                var fileName = request.Headers.TryGetValues("X-File-Name", out var nameValues)
                    ? Uri.UnescapeDataString(nameValues.FirstOrDefault() ?? "recurso") : "recurso";
                var contentType = request.Headers.TryGetValues("Content-Type", out var typeValues)
                    ? typeValues.FirstOrDefault() ?? "application/octet-stream" : "application/octet-stream";
                await _files.UploadAsync(id, bounded, fileName, contentType, cancellationToken);
                var accepted = request.CreateResponse(HttpStatusCode.NoContent);
                return AddCors(accepted);
            }
            var result = await _files.DownloadAsync(id, cancellationToken);
            if (result is null) return await Fail(request, HttpStatusCode.NotFound, "Archivo no encontrado.");
            var response = request.CreateResponse(HttpStatusCode.OK);
            response.Headers.Add("Content-Type", result.Value.ContentType);
            response.Headers.Add("Content-Disposition", $"attachment; filename*=UTF-8''{Uri.EscapeDataString(result.Value.FileName)}");
            await result.Value.Content.CopyToAsync(response.Body, cancellationToken);
            return AddCors(response);
        }
        catch (ArgumentException exception) { return await Fail(request, HttpStatusCode.UnsupportedMediaType, exception.Message); }
        catch (KeyNotFoundException exception) { return await Fail(request, HttpStatusCode.NotFound, exception.Message); }
        catch (Exception) { return await Fail(request, HttpStatusCode.InternalServerError, "No se pudo procesar el archivo."); }
    }

    private static async Task<HttpResponseData> Fail(HttpRequestData request, HttpStatusCode status, string message)
    {
        var response = request.CreateResponse(status);
        await response.WriteAsJsonAsync(new { error = message });
        return AddCors(response);
    }

    private static HttpResponseData AddCors(HttpResponseData response)
    {
        var origin = Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGIN");
        if (!string.IsNullOrWhiteSpace(origin))
        {
            response.Headers.Add("Access-Control-Allow-Origin", origin);
            response.Headers.Add("Vary", "Origin");
            response.Headers.Add("Access-Control-Allow-Headers", "Authorization, Content-Type, X-File-Name");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
        }
        return response;
    }
}
