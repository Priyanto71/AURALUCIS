using JewelryApi.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace JewelryApi.Controllers;

// No login needed: this is what a customer sees after scanning the QR code on a receipt.
// It only returns a safe copy (no phone, e-mail, address or staff names).
[ApiController]
[Route("api/public")]
[AllowAnonymous]
public class PublicController(ReceiptService receipts) : ControllerBase
{
    [HttpGet("receipt/{code}")]
    public async Task<IActionResult> Receipt(string code)
    {
        // the code is a long random hex string; anything else cannot exist
        if (code.Length < 16 || code.Length > 40 || !code.All(Uri.IsHexDigit))
            return NotFound(new { error = "Receipt not found." });

        var r = await receipts.GetByCodeAsync(code);
        return r is null ? NotFound(new { error = "Receipt not found." }) : Ok(r.ToPublic());
    }
}
