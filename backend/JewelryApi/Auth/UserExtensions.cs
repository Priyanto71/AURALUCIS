using System.Security.Claims;

namespace JewelryApi.Auth;

public static class UserExtensions
{
    // The logged-in employee's id (null if there is none)
    public static int? GetEmployeeId(this ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id) ? id : null;
}
