using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using Npgsql;

public sealed class ChurchRepository
{
    private static readonly Dictionary<string, Entity> Entities = new(StringComparer.OrdinalIgnoreCase)
    {
        ["members"] = new("members", "Admin", new[] { "full_name", "phone", "email", "status", "joined_on" }),
        ["groups"] = new("groups", "Admin", new[] { "name", "description", "leader_name", "meeting_schedule", "active" }),
        ["memberships"] = new("group_members", "Admin", new[] { "group_id", "member_id" }),
        ["services"] = new("services", "Admin", new[] { "name", "starts_at", "location", "notes" }),
        ["attendance"] = new("attendance", "Admin", new[] { "service_id", "member_id", "attended_on", "status" }),
        ["resources"] = new("resources", "Admin", new[] { "title", "description", "speaker", "preached_on" }),
        ["treasury"] = new("treasury_movements", "Treasury", new[] { "direction", "category", "amount", "occurred_on", "description", "member_id", "member_name" }),
        ["pastoral"] = new("pastoral_followups", "Pastoral", new[] { "subject", "follow_up_on", "assigned_to", "status", "notes" })
    };

    private readonly string _connectionString;
    public ChurchRepository() => _connectionString = TokenValidator.Required("DATABASE_URL");

    public static string? RequiredRole(string resource) =>
        Entities.TryGetValue(resource, out var entity) ? entity.Role :
        resource.Equals("reports", StringComparison.OrdinalIgnoreCase) ? "Admin" : null;

    public async Task<object> ListAsync(string resource, ClaimsPrincipal user, DateOnly from, DateOnly to, CancellationToken cancellationToken)
    {
        await using var connection = await OpenAsync(cancellationToken);
        if (resource.Equals("reports", StringComparison.OrdinalIgnoreCase))
            return await ReportAsync(connection, user, from, to, cancellationToken);
        var entity = GetEntity(resource);
        var projection = resource.Equals("attendance", StringComparison.OrdinalIgnoreCase)
            ? "a.id, a.service_id, a.member_id, a.attended_on, a.status, s.name AS service_name, m.full_name AS member_name"
            : resource.Equals("memberships", StringComparison.OrdinalIgnoreCase)
            ? "gm.id, gm.group_id, gm.member_id, gm.joined_at, g.name AS group_name, m.full_name AS member_name"
            : resource.Equals("treasury", StringComparison.OrdinalIgnoreCase)
            ? "t.*, COALESCE(t.member_name, m.full_name) AS member_name"
            : "*";
        var source = resource.Equals("attendance", StringComparison.OrdinalIgnoreCase)
            ? "attendance a JOIN services s ON s.id = a.service_id JOIN members m ON m.id = a.member_id"
            : resource.Equals("memberships", StringComparison.OrdinalIgnoreCase)
            ? "group_members gm JOIN groups g ON g.id = gm.group_id JOIN members m ON m.id = gm.member_id"
            : resource.Equals("treasury", StringComparison.OrdinalIgnoreCase)
            ? "treasury_movements t LEFT JOIN members m ON m.id = t.member_id"
            : entity.Table;
        var sql = $"SELECT {projection} FROM {source}" +
                  (resource.Equals("attendance", StringComparison.OrdinalIgnoreCase) ? " ORDER BY a.attended_on DESC" :
                   resource.Equals("memberships", StringComparison.OrdinalIgnoreCase) ? " ORDER BY gm.joined_at DESC" :
                   resource.Equals("pastoral", StringComparison.OrdinalIgnoreCase) ? " ORDER BY follow_up_on DESC" :
                   resource.Equals("treasury", StringComparison.OrdinalIgnoreCase) ? " ORDER BY t.occurred_on DESC" : " ORDER BY created_at DESC") +
                  " LIMIT 500";
        var results = new List<Dictionary<string, object?>>();
        await using (var command = new NpgsqlCommand(sql, connection))
        await using (var reader = await command.ExecuteReaderAsync(cancellationToken))
        {
            while (await reader.ReadAsync(cancellationToken))
            {
                var record = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
                for (var i = 0; i < reader.FieldCount; i++)
                    record[reader.GetName(i)] = await reader.IsDBNullAsync(i, cancellationToken) ? null : reader.GetValue(i);
                results.Add(record);
            }
        }
        if (resource.Equals("pastoral", StringComparison.OrdinalIgnoreCase))
            await AuditAsync(connection, user, "READ", "pastoral_followups", null, cancellationToken);
        return results;
    }

    public async Task<object> CreateAsync(string resource, JsonElement body, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var entity = GetEntity(resource);
        var values = ReadValues(entity, body);
        Validate(resource, values, creating: true);
        var columns = values.Keys.ToArray();
        if (columns.Length == 0) throw new ArgumentException("Incluya al menos un campo válido.");
        await using var connection = await OpenAsync(cancellationToken);
        var names = string.Join(", ", columns.Select(Quote));
        var parameters = string.Join(", ", columns.Select((_, i) => $"@p{i}"));
        var sql = $"INSERT INTO {Quote(entity.Table)} ({names}) VALUES ({parameters}) RETURNING id";
        await using var command = new NpgsqlCommand(sql, connection);
        AddParameters(command, values);
        var id = (Guid)(await command.ExecuteScalarAsync(cancellationToken) ?? throw new InvalidOperationException("No se pudo crear el registro."));
        await AuditAsync(connection, user, "CREATE", entity.Table, id, cancellationToken);
        return new { id };
    }

    public async Task<object?> UpdateAsync(string resource, Guid id, JsonElement body, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var entity = GetEntity(resource);
        var values = ReadValues(entity, body);
        Validate(resource, values, creating: false);
        if (values.Count == 0) throw new ArgumentException("No hay campos válidos para actualizar.");
        await using var connection = await OpenAsync(cancellationToken);
        var assignments = values.Keys.Select((key, index) => $"{Quote(key)} = @p{index}").ToArray();
        await using var command = new NpgsqlCommand(
            $"UPDATE {Quote(entity.Table)} SET {string.Join(", ", assignments)}, updated_at = now() WHERE id = @id", connection);
        AddParameters(command, values);
        command.Parameters.AddWithValue("id", id);
        if (await command.ExecuteNonQueryAsync(cancellationToken) == 0) return null;
        await AuditAsync(connection, user, "UPDATE", entity.Table, id, cancellationToken);
        return new { id };
    }

    public async Task<bool> DeleteAsync(string resource, Guid id, ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var entity = GetEntity(resource);
        await using var connection = await OpenAsync(cancellationToken);
        await using var command = new NpgsqlCommand($"DELETE FROM {Quote(entity.Table)} WHERE id = @id", connection);
        command.Parameters.AddWithValue("id", id);
        if (await command.ExecuteNonQueryAsync(cancellationToken) == 0) return false;
        await AuditAsync(connection, user, "DELETE", entity.Table, id, cancellationToken);
        return true;
    }

    private async Task<object> ReportAsync(NpgsqlConnection connection, ClaimsPrincipal user, DateOnly from, DateOnly to, CancellationToken cancellationToken)
    {
        var income = 0m;
        var expense = 0m;
        var categories = new List<object>();
        if (user.IsInRole("Treasury"))
        {
            await using var command = new NpgsqlCommand("""
                SELECT direction, category, COALESCE(SUM(amount), 0)
                FROM treasury_movements WHERE occurred_on BETWEEN @from AND @to
                GROUP BY direction, category ORDER BY direction, category
                """, connection);
            command.Parameters.AddWithValue("from", from);
            command.Parameters.AddWithValue("to", to);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
            {
                var direction = reader.GetString(0);
                var category = reader.GetString(1);
                var amount = reader.GetDecimal(2);
                if (direction == "Ingreso")
                {
                    income += amount;
                    categories.Add(new { category, total = amount });
                }
                else expense += amount;
            }
        }
        var activeMembers = await ScalarAsync<long>(connection,
            "SELECT count(*) FROM members WHERE status = 'Activo'", cancellationToken);
        await using var serviceCount = new NpgsqlCommand(
            "SELECT count(*) FROM services WHERE (starts_at AT TIME ZONE 'America/El_Salvador')::date BETWEEN @from AND @to", connection);
        serviceCount.Parameters.AddWithValue("from", from);
        serviceCount.Parameters.AddWithValue("to", to);
        var services = Convert.ToInt64(await serviceCount.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        await using var attendanceCount = new NpgsqlCommand(
            "SELECT count(*) FROM attendance WHERE attended_on BETWEEN @from AND @to AND status = 'Presente'", connection);
        attendanceCount.Parameters.AddWithValue("from", from);
        attendanceCount.Parameters.AddWithValue("to", to);
        var attendance = Convert.ToInt64(await attendanceCount.ExecuteScalarAsync(cancellationToken), CultureInfo.InvariantCulture);
        var report = new Dictionary<string, object>
        {
            ["active_members"] = activeMembers,
            ["services_count"] = services,
            ["attendance_count"] = attendance
        };
        if (user.IsInRole("Treasury"))
        {
            report["income_total"] = income;
            report["expense_total"] = expense;
            report["balance"] = income - expense;
            report["income_by_category"] = categories;
        }
        return report;
    }

    private static async Task<T> ScalarAsync<T>(NpgsqlConnection connection, string sql, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand(sql, connection);
        return (T)Convert.ChangeType(await command.ExecuteScalarAsync(cancellationToken)!, typeof(T), CultureInfo.InvariantCulture);
    }

    private static Dictionary<string, object?> ReadValues(Entity entity, JsonElement body)
    {
        if (body.ValueKind != JsonValueKind.Object) throw new ArgumentException("Se esperaba un objeto JSON.");
        var values = new Dictionary<string, object?>(StringComparer.OrdinalIgnoreCase);
        foreach (var property in body.EnumerateObject())
        {
            if (!entity.Columns.Contains(property.Name, StringComparer.OrdinalIgnoreCase)) continue;
            object? value = property.Value.ValueKind switch
            {
                JsonValueKind.Null => null,
                JsonValueKind.String => ParseStringValue(property.Name, property.Value.GetString()),
                JsonValueKind.Number => property.Value.GetDecimal(),
                JsonValueKind.True => true,
                JsonValueKind.False => false,
                _ => throw new ArgumentException($"El campo '{property.Name}' tiene un tipo no permitido.")
            };
            values[property.Name] = value;
        }
        return values;
    }

    private static object? ParseStringValue(string key, string? value)
    {
        if (value is null) return null;
        if (key.EndsWith("_id", StringComparison.OrdinalIgnoreCase))
            return Guid.TryParse(value, out var id) ? id : throw new ArgumentException($"El identificador '{key}' no es válido.");
        if (key.EndsWith("_on", StringComparison.OrdinalIgnoreCase))
            return DateOnly.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date)
                ? date : throw new ArgumentException($"La fecha '{key}' no es válida.");
        if (key == "starts_at")
        {
            var parsedOffset = DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var timestamp);
            if (parsedOffset && (value.Length >= 6 && (value[^6] is '+' or '-') ||
                                 value.EndsWith("Z", StringComparison.OrdinalIgnoreCase))) return timestamp;
            if (DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var localTime))
            {
                var zone = FindElSalvadorTimeZone();
                return new DateTimeOffset(TimeZoneInfo.ConvertTimeToUtc(DateTime.SpecifyKind(localTime, DateTimeKind.Unspecified), zone));
            }
            throw new ArgumentException("La fecha y hora del servicio no es válida.");
        }
        return value;
    }

    private static TimeZoneInfo FindElSalvadorTimeZone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById("America/El_Salvador"); }
        catch (TimeZoneNotFoundException) { return TimeZoneInfo.FindSystemTimeZoneById("Central America Standard Time"); }
    }

    private static void Validate(string resource, Dictionary<string, object?> values, bool creating)
    {
        var required = resource.ToLowerInvariant() switch
        {
            "members" => new[] { "full_name" },
            "groups" => new[] { "name" },
            "services" => new[] { "name", "starts_at" },
            "attendance" => new[] { "service_id", "member_id", "attended_on", "status" },
            "memberships" => new[] { "group_id", "member_id" },
            "resources" => new[] { "title" },
            "treasury" => new[] { "direction", "category", "amount", "occurred_on" },
            "pastoral" => new[] { "subject", "follow_up_on", "assigned_to", "notes" },
            _ => Array.Empty<string>()
        };
        if (creating)
            foreach (var key in required)
                if (!values.TryGetValue(key, out var value) || value is null || value is string text && string.IsNullOrWhiteSpace(text))
                    throw new ArgumentException($"El campo '{key}' es obligatorio.");
        if (resource.Equals("treasury", StringComparison.OrdinalIgnoreCase) &&
            (!values.TryGetValue("amount", out var amount) || amount is not decimal number || number <= 0 || number > 10000000))
            throw new ArgumentException("El monto debe ser mayor que cero y estar dentro del límite permitido.");
        foreach (var pair in values)
            if (pair.Value is string text && text.Length > (pair.Key == "notes" ? 4000 : 500))
                throw new ArgumentException($"El campo '{pair.Key}' excede la longitud permitida.");
    }

    private async Task<NpgsqlConnection> OpenAsync(CancellationToken cancellationToken)
    {
        var connection = new NpgsqlConnection(_connectionString);
        await connection.OpenAsync(cancellationToken);
        return connection;
    }

    private static async Task AuditAsync(NpgsqlConnection connection, ClaimsPrincipal user, string operation,
        string entity, Guid? id, CancellationToken cancellationToken)
    {
        await using var command = new NpgsqlCommand("""
            INSERT INTO audit_log (actor, operation, entity_name, entity_id)
            VALUES (@actor, @operation, @entity, @id)
            """, connection);
        command.Parameters.AddWithValue("actor", user.FindFirst("oid")?.Value ?? user.Identity?.Name ?? "authenticated-user");
        command.Parameters.AddWithValue("operation", operation);
        command.Parameters.AddWithValue("entity", entity);
        command.Parameters.AddWithValue("id", (object?)id ?? DBNull.Value);
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    private static Entity GetEntity(string resource) =>
        Entities.TryGetValue(resource, out var entity) ? entity : throw new KeyNotFoundException("Módulo no encontrado.");
    private static string Quote(string identifier) => "\"" + identifier.Replace("\"", "\"\"") + "\"";
    private static void AddParameters(NpgsqlCommand command, Dictionary<string, object?> values)
    {
        var index = 0;
        foreach (var value in values.Values) command.Parameters.AddWithValue($"p{index++}", value ?? DBNull.Value);
    }

    private sealed record Entity(string Table, string Role, string[] Columns);
}
