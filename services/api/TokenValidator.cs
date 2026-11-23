using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using Microsoft.IdentityModel.Protocols;
using Microsoft.IdentityModel.Protocols.OpenIdConnect;
using Microsoft.IdentityModel.Tokens;

public sealed class TokenValidator
{
    private readonly string _tenant = Required("ENTRA_TENANT_ID");
    private readonly string _audience = Required("ENTRA_API_AUDIENCE");
    private readonly ConfigurationManager<OpenIdConnectConfiguration> _configuration;
    private readonly JwtSecurityTokenHandler _handler = new() { MapInboundClaims = false };

    public TokenValidator()
    {
        var metadata = $"https://login.microsoftonline.com/{_tenant}/v2.0/.well-known/openid-configuration";
        _configuration = new ConfigurationManager<OpenIdConnectConfiguration>(
            metadata, new OpenIdConnectConfigurationRetriever(), new HttpDocumentRetriever { RequireHttps = true });
    }

    public async Task<ClaimsPrincipal?> ValidateAsync(string? authorization, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(authorization) || !authorization.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return null;
        try
        {
            var configuration = await _configuration.GetConfigurationAsync(cancellationToken);
            var parameters = new TokenValidationParameters
            {
                ValidateIssuer = true,
                ValidIssuer = configuration.Issuer,
                ValidateAudience = true,
                ValidAudience = _audience,
                ValidateIssuerSigningKey = true,
                IssuerSigningKeys = configuration.SigningKeys,
                ValidateLifetime = true,
                RequireExpirationTime = true,
                RequireSignedTokens = true,
                ClockSkew = TimeSpan.FromMinutes(2),
                RoleClaimType = "roles",
                NameClaimType = "name"
            };
            return _handler.ValidateToken(authorization["Bearer ".Length..].Trim(), parameters, out _);
        }
        catch (Exception exception) when (exception is SecurityTokenException or InvalidOperationException or HttpRequestException)
        {
            return null;
        }
    }

    public static string Required(string name) =>
        Environment.GetEnvironmentVariable(name) is { Length: > 0 } value
            ? value
            : throw new InvalidOperationException($"Required configuration '{name}' is missing.");
}
