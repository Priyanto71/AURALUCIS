using System.Net;
using JewelryApi.Models;

namespace JewelryApi.Services;

// Turns a receipt into the HTML e-mail.
public static class ReceiptFormatter
{
    private static string M(decimal v) => v.ToString("0.00");

    public static string Html(ReceiptDto r)
    {
        string E(string? s) => WebUtility.HtmlEncode(s ?? "");
        var rows = string.Join("", r.Items.Select(i =>
            $"<tr><td style='padding:4px 8px'>{E(i.ProductName)}</td><td style='padding:4px 8px;text-align:right'>{i.Quantity}</td>" +
            $"<td style='padding:4px 8px;text-align:right'>{M(i.UnitPrice)}</td><td style='padding:4px 8px;text-align:right'>{M(i.LineTotal)}</td></tr>"));

        var extra = "";
        if (r.DiscountAmount > 0) extra += $"<tr><td colspan='3' style='text-align:right;padding:4px 8px'>Discount</td><td style='text-align:right;padding:4px 8px'>-{M(r.DiscountAmount)}</td></tr>";
        if (r.VatAmount > 0) extra += $"<tr><td colspan='3' style='text-align:right;padding:4px 8px'>VAT ({r.VatPercent:0.##}%)</td><td style='text-align:right;padding:4px 8px'>{M(r.VatAmount)}</td></tr>";

        return $@"<div style='font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#222'>
  <h2 style='letter-spacing:3px;color:#7a5c0e;margin-bottom:0'>{E(r.ShopName)}</h2>
  <p style='margin-top:2px;color:#777'><i>{E(r.ShopTagline)}</i></p>
  <p>Dear {E(r.CustomerName)},<br>thank you for your purchase. Your receipt <b>{r.ReceiptNo}</b> dated {r.OrderDate:yyyy-MM-dd HH:mm}:</p>
  <table style='border-collapse:collapse;width:100%;font-size:14px'>
    <tr style='background:#f3e9c6'><th style='padding:6px 8px;text-align:left'>Item</th><th style='padding:6px 8px;text-align:right'>Qty</th><th style='padding:6px 8px;text-align:right'>Price</th><th style='padding:6px 8px;text-align:right'>Total</th></tr>
    {rows}{extra}
    <tr><td colspan='3' style='text-align:right;padding:6px 8px'><b>Total</b></td><td style='text-align:right;padding:6px 8px'><b>{M(r.TotalAmount)}</b></td></tr>
    <tr><td colspan='3' style='text-align:right;padding:4px 8px'>Paid</td><td style='text-align:right;padding:4px 8px'>{M(r.PaidAmount)}</td></tr>
    <tr><td colspan='3' style='text-align:right;padding:4px 8px'>Due</td><td style='text-align:right;padding:4px 8px'>{M(r.DueAmount)}</td></tr>
  </table>
  <p>You can check this receipt online: <a href='{E(r.PublicUrl)}'>{E(r.PublicUrl)}</a></p>
  <p style='color:#777;font-size:12px'>{E(r.ShopAddress)} {E(r.ShopPhone)}</p>
</div>";
    }

    public static string Subject(ReceiptDto r) => $"{r.ShopName} receipt {r.ReceiptNo}";

}
