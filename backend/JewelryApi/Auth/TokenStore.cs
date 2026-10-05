using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace JewelryApi.Auth;

public record AuthUser(int EmployeeId, string Username, string Name, string Role, DateTime Expires);

// Keeps login tokens in server memory. Restarting the API logs everyone out (fine for this project).
public class TokenStore
{
    private readonly ConcurrentDictionary<string, AuthUser> _tokens = new();

    public string Issue(AuthUser user)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
        _tokens[token] = user;
        return token;
    }

    public AuthUser? Get(string token)
    {
        if (!_tokens.TryGetValue(token, out var user)) return null;
        if (user.Expires > DateTime.UtcNow) return user;
        _tokens.TryRemove(token, out _);
        return null;
    }

    public void Revoke(string token) => _tokens.TryRemove(token, out _);
}
