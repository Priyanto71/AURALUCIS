
using System.Security.Claims;
using System.Text.Encodings.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace JewelryApi.Auth;

public class TokenAuthHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    private readonly TokenStore _store;

    public TokenAuthHandler(
        IOptionsMonitor<AuthenticationSchemeOptions> options,
        ILoggerFactory logger,
        UrlEncoder encoder,
        TokenStore store)
        : base(options, logger, encoder)
    {
        _store = store;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var header = Request.Headers.Authorization.ToString();

        if (!header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
            return Task.FromResult(AuthenticateResult.NoResult());

        var user = _store.Get(header.Substring(7).Trim());

        if (user is null)
            return Task.FromResult(AuthenticateResult.Fail("Invalid or expired token."));

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.EmployeeId.ToString()),
            new Claim(ClaimTypes.Name, user.Name),
            new Claim(ClaimTypes.Role, user.Role),
            new Claim("must_change_password", user.MustChangePassword.ToString().ToLowerInvariant())
        };

        var identity = new ClaimsIdentity(claims, Scheme.Name);
        var ticket = new AuthenticationTicket(new ClaimsPrincipal(identity), Scheme.Name);

        return Task.FromResult(AuthenticateResult.Success(ticket));
    }
}
