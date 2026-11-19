
using System.Collections.Concurrent;
using System.Security.Cryptography;

namespace JewelryApi.Auth;

public record AuthUser(
    int EmployeeId,
    string Username,
    string Name,
    string Role,
    DateTime Expires,
    bool MustChangePassword
);

// Keeps login tokens in server memory. Restarting the API logs everyone out.
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

    // Update all active sessions after an employee changes their password.
    public void SetMustChangePassword(int employeeId, bool required)
    {
        foreach (var pair in _tokens.Where(p => p.Value.EmployeeId == employeeId))
        {
            _tokens.TryUpdate(
                pair.Key,
                pair.Value with { MustChangePassword = required },
                pair.Value
            );
        }
    }

    // Logs an employee out everywhere.
    public void RevokeEmployee(int employeeId)
    {
        foreach (var pair in _tokens.Where(p => p.Value.EmployeeId == employeeId))
            _tokens.TryRemove(pair.Key, out _);
    }
}
