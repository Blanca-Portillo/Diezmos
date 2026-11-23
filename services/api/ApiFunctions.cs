using System.Net;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Http;
using Npgsql;

public sealed class ApiFunctions
{
    private readonly TokenValidator _tokens;
    private readonly ChurchRepository _repository;
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public ApiFunctions(TokenValidator tokens, ChurchRepository repository) { _tokens = tokens; _repository = repository; }

    [Function("Health")]
    public async Task<HttpResponseData> Health([HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "health")] HttpRequestData request)
    {
        var response = request.CreateResponse(HttpStatusCode.OK);
        await response.WriteAsJsonAsync(new { status = "ok", service = "diezmos-api" });
        return Cors(response);
    }

    [Function("ChurchApi")]
    public async Task<HttpResponseData> Route([HttpTrigger(AuthorizationLevel.Anonymous,
        "get", "post", "put", "delete", "options", Route = "{resource}/{id?}")] HttpRequestData request,
        string resource, string? id, CancellationToken cancellationToken)
    {
        if (request.Method.Equals("OPTIONS", StringComparison.OrdinalIgnoreCase))
            return Cors(request.CreateResponse(HttpStatusCode.NoContent));
        var principal = await _tokens.ValidateAsync(request.Headers.TryGetValues("Authorization", out var values)
            ? values.FirstOrDefault() : null, cancellationToken);
        if (principal is null) return await Error(request, HttpStatusCode.Unauthorized, "Se requiere una sesión válida.");
        var role = ChurchRepository.RequiredRole(resource);
        if (role is null) return await Error(request, HttpStatusCode.NotFound, "Ruta no encontrada.");
        if (!principal.IsInRole(role)) return await Error(request, HttpStatusCode.Forbidden, "No tiene permiso para esta operación.");

        try
        {
            var today = DateOnly.FromDateTime(TimeZoneInfo.ConvertTime(DateTimeOffset.UtcNow,
                TimeZoneInfo.FindSystemTimeZoneById("America/El_Salvador")).DateTime);
            var from = ReadDate(request.Url.Query, "from") ?? today.AddDays(-30);
            var to = ReadDate(request.Url.Query, "to") ?? today;
            if (from > to || to.DayNumber - from.DayNumber > 1825)
                return await Error(request, HttpStatusCode.BadRequest, "El rango debe ser válido y no exceder cinco años.");
            object? result;
            switch (request.Method.ToUpperInvariant())
            {
                case "GET":
                    result = await _repository.ListAsync(resource, principal, from, to, cancellationToken);
                    break;
                case "POST":
                    result = await _repository.CreateAsync(resource, await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken), principal, cancellationToken);
                    return await Json(request, HttpStatusCode.Created, result);
                case "PUT" when Guid.TryParse(id, out var updateId):
                    result = await _repository.UpdateAsync(resource, updateId,
                        await JsonDocument.ParseAsync(request.Body, cancellationToken: cancellationToken), principal, cancellationToken);
                    if (result is null) return await Error(request, HttpStatusCode.NotFound, "Registro no encontrado.");
                    break;
                case "DELETE" when Guid.TryParse(id, out var deleteId):
                    return (await _repository.DeleteAsync(resource, deleteId, principal, cancellationToken))
                        ? Cors(request.CreateResponse(HttpStatusCode.NoContent))
                        : await Error(request, HttpStatusCode.NotFound, "Registro no encontrado.");
                default:
                    return await Error(request, HttpStatusCode.BadRequest, "Método o identificador no válido.");
            }
            return await Json(request, HttpStatusCode.OK, result);
        }
        catch (JsonException) { return await Error(request, HttpStatusCode.BadRequest, "El contenido JSON no es válido."); }
        catch (ArgumentException exception) { return await Error(request, HttpStatusCode.BadRequest, exception.Message); }
        catch (PostgresException exception) when (exception.SqlState is "23503" or "23505" or "23514")
        { return await Error(request, HttpStatusCode.BadRequest, "El registro tiene referencias, valores o duplicados no permitidos."); }
        catch (KeyNotFoundException exception) { return await Error(request, HttpStatusCode.NotFound, exception.Message); }
        catch (Exception)
        {
            // Avoid returning SQL, connection strings or sensitive record values to the client.
            return await Error(request, HttpStatusCode.InternalServerError, "No se pudo completar la operación.");
        }
    }

    private static async Task<HttpResponseData> Json(HttpRequestData request, HttpStatusCode status, object? body)
    {
        var response = request.CreateResponse(status);
        await response.WriteAsJsonAsync(body, JsonOptions);
        return Cors(response);
    }

    private static async Task<HttpResponseData> Error(HttpRequestData request, HttpStatusCode status, string message) =>
        await Json(request, status, new { error = message });

    private static DateOnly? ReadDate(string query, string key)
    {
        foreach (var pair in query.TrimStart('?').Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var parts = pair.Split('=', 2);
            if (parts.Length == 2 && Uri.UnescapeDataString(parts[0]).Equals(key, StringComparison.OrdinalIgnoreCase))
            {
                var value = Uri.UnescapeDataString(parts[1]);
                if (!DateOnly.TryParse(value, out var date)) throw new ArgumentException($"La fecha '{key}' no es válida.");
                return date;
            }
        }
        return null;
    }

    private static HttpResponseData Cors(HttpResponseData response)
    {
        var origin = Environment.GetEnvironmentVariable("CORS_ALLOWED_ORIGIN");
        if (!string.IsNullOrWhiteSpace(origin))
        {
            response.Headers.Add("Access-Control-Allow-Origin", origin);
            response.Headers.Add("Vary", "Origin");
            response.Headers.Add("Access-Control-Allow-Headers", "Authorization, Content-Type, X-File-Name");
            response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        }
        return response;
    }
}
