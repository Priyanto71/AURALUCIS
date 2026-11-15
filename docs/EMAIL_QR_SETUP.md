# AURALUCIS: setting up e-mail and the QR code

All server settings are in `backend\JewelryApi\appsettings.json` (this file is never uploaded to GitHub).
**After you change it, stop the API (Ctrl+C) and run `dotnet run` again.**

---

## 1. E-mail receipts

The system sends mail through any SMTP server. Pick one:

### Option A: Gmail (easiest to start)
1. Use a Google account (a new one just for the shop is best).
2. Turn on **2-Step Verification** for it (Google Account > Security).
3. Open https://myaccount.google.com/apppasswords and create an **App password** named "AURALUCIS". Google shows a 16-letter password. Copy it.
4. Put this in `appsettings.json` (replace the three values):

```json
"Email": {
  "Host": "smtp.gmail.com",
  "Port": 587,
  "EnableSsl": true,
  "User": "yourshop@gmail.com",
  "Password": "abcdefghijklmnop",
  "From": "yourshop@gmail.com"
}
```
The password is the **App password**, not your normal Gmail password. Gmail limits sending (about 500 mails a day), which is plenty for a shop.

### Option B: Brevo (free plan, made for sending mail)
1. Create a free account at brevo.com and open **SMTP & API**.
2. Create an SMTP key. Use the host, port and login shown there (usually `smtp-relay.brevo.com`, port `587`).
3. Verify your sender address in Brevo, then use it as `From`.

```json
"Email": {
  "Host": "smtp-relay.brevo.com",
  "Port": 587,
  "EnableSsl": true,
  "User": "your-brevo-login",
  "Password": "your-smtp-key",
  "From": "yourshop@example.com"
}
```

### Option C: test only (no real mail is sent)
Mailtrap gives a fake inbox. Copy its SMTP host, port, user and password into the same `Email` section. Mails appear on the Mailtrap website instead of the customer's inbox. Good for a demo.

### Test it
1. Make sure the customer has an e-mail address (Customers tab), or type one in the receipt window.
2. Orders > **Receipt** > press **E-mail**.

| Message | Meaning and fix |
|---|---|
| E-mail is not set up on the server | `Host` is empty in `appsettings.json`, or you did not restart the API |
| The mail server refused the message: ...5.7.0 Authentication Required / Username and Password not accepted | Wrong user or password. For Gmail it must be the App password |
| ...requires a secure connection | Set `"EnableSsl": true` and port `587` |
| That e-mail address is not valid | Check the spelling of the address |
| Nothing arrives | Look in the spam folder |

---

## 2. WhatsApp and PDF (no setup)

- **WhatsApp** button: opens WhatsApp with the receipt text ready to send to the customer's number.
- **Download PDF** button: saves the receipt as a PDF file you can send in any app.

---

## 3. The QR code

The QR code on the receipt opens `website link/verify/long random code`, a read-only receipt page that needs no login.

### If no QR code is drawn
1. In `C:\AURALUCIS\frontend` run `npm install`, then `npm run dev` again. The QR code needs the `qrcode` package.
2. Press **Ctrl+F5** in the browser.
3. Open the receipt again. You should see the QR code and, under it, the link as text.

### If the QR code is drawn but the phone cannot open it
Almost always the website link is `localhost`, which only exists on your own computer.

1. Find your computer's Wi-Fi address: open PowerShell and run `ipconfig`. Look for **IPv4 Address** under your Wi-Fi adapter, for example `192.168.1.20`.
2. In the website: Setup > Shop settings > **Website link** = `http://192.168.1.20:5173`. Save.
3. Keep the phone on **the same Wi-Fi** as the computer.
4. Make a **new** sale (or reopen a receipt) and scan again. The link is read from the settings each time the receipt is shown.
5. If the phone still shows "can't connect", allow the app through the Windows firewall: when Windows asks "Allow Node.js on private networks?" choose **Allow**. Or in PowerShell (as Administrator):
   `New-NetFirewallRule -DisplayName "AURALUCIS dev" -Direction Inbound -Protocol TCP -LocalPort 5173 -Action Allow`
6. Test the link first by typing it into the phone's browser.

### If the page says "Receipt not found"
The code in the link does not exist in the database, for example you scanned a receipt from another database. Reopen the order and scan the new QR code.

### For a real shop
`http://192.168...` only works inside the shop. For customers at home, the website and API must be hosted online with HTTPS (a cloud server or a service such as Azure, or a tunnel such as Cloudflare Tunnel for testing). Then set the Website link to that address.
