# AURALUCIS smoke test: calls the running API and prints PASS or FAIL for each check.
#
#   Read-only checks (nothing is changed):
#       powershell -ExecutionPolicy Bypass -File scripts\smoke_test.ps1
#   Full test (also makes a test customer, a sale, a payment, a return and a stock adjustment):
#       powershell -ExecutionPolicy Bypass -File scripts\smoke_test.ps1 -Full
#
# The API must be running (dotnet run). Demo logins: admin/admin123 and staff/staff123.
param(
    [string]$BaseUrl = "http://localhost:5000",
    [string]$AdminUser = "admin",  [string]$AdminPassword = "admin123",
    [string]$StaffUser = "staff",  [string]$StaffPassword = "staff123",
    [switch]$Full
)

$script:passed = 0
$script:failed = @()

# one API call; never throws, always returns Status (and Body or Error)
function Call($Method, $Path, $Body = $null, $Token = $null) {
    $headers = @{}
    if ($Token) { $headers["Authorization"] = "Bearer $Token" }
    $p = @{ Method = $Method; Uri = "$BaseUrl$Path"; Headers = $headers; UseBasicParsing = $true }
    if ($null -ne $Body) { $p["Body"] = ($Body | ConvertTo-Json -Depth 8); $p["ContentType"] = "application/json" }
    try {
        $r = Invoke-WebRequest @p
        $json = $null
        if ($r.Content) { $json = $r.Content | ConvertFrom-Json }
        return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $json; Error = "" }
    } catch {
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        $msg = $_.Exception.Message
        if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $msg = $_.ErrorDetails.Message }
        return [pscustomobject]@{ Status = $status; Body = $null; Error = $msg }
    }
}

function Check($Name, [scriptblock]$Test) {
    try {
        $ok = & $Test
        if ($ok -eq $true) { Write-Host ("  PASS  " + $Name) -ForegroundColor Green; $script:passed++ }
        else { Write-Host ("  FAIL  " + $Name) -ForegroundColor Red; $script:failed += $Name }
    } catch {
        Write-Host ("  FAIL  " + $Name + "   (" + $_.Exception.Message + ")") -ForegroundColor Red
        $script:failed += $Name
    }
}

function Section($Title) { Write-Host ""; Write-Host $Title -ForegroundColor Cyan }

Write-Host "AURALUCIS smoke test against $BaseUrl" -ForegroundColor Cyan

# ---------------------------------------------------------------- login
Section "1. Login and roles"
$login = Call "POST" "/api/auth/login" @{ username = $AdminUser; password = $AdminPassword }
Check "admin can log in" { $login.Status -eq 200 -and $login.Body.token }
if ($login.Status -ne 200) {
    Write-Host ""
    Write-Host "Login failed: $($login.Error)" -ForegroundColor Red
    Write-Host "Is the API running at $BaseUrl, and was 06_upgrade.sql run? Nothing else can be tested." -ForegroundColor Yellow
    exit 1
}
$admin = $login.Body.token

$staffLogin = Call "POST" "/api/auth/login" @{ username = $StaffUser; password = $StaffPassword }
Check "staff can log in" { $staffLogin.Status -eq 200 }
$staff = $staffLogin.Body.token

Check "wrong password is refused (401)" { (Call "POST" "/api/auth/login" @{ username = $AdminUser; password = "wrong-password" }).Status -eq 401 }
Check "no token is refused (401)" { (Call "GET" "/api/products").Status -eq 401 }
Check "/api/auth/me shows the Manager" { $m = Call "GET" "/api/auth/me" $null $admin; $m.Status -eq 200 -and $m.Body.role -eq "Manager" }

# ---------------------------------------------------------------- lists
Section "2. Lists load (this also proves the new SQL columns and views exist)"
foreach ($path in @("/api/products", "/api/categories", "/api/suppliers", "/api/customers", "/api/employees",
                    "/api/orders", "/api/stock/transactions", "/api/rates", "/api/settings", "/api/purchases")) {
    $r = Call "GET" $path $null $admin
    Check "GET $path" { $r.Status -eq 200 }
}
$dash = Call "GET" "/api/reports/dashboard" $null $admin
Check "GET /api/reports/dashboard" { $dash.Status -eq 200 -and $null -ne $dash.Body.summary }
$from = (Get-Date).AddDays(-30).ToString("yyyy-MM-dd"); $to = (Get-Date).ToString("yyyy-MM-dd")
$rep = Call "GET" "/api/reports/sales?from=$from&to=$to" $null $admin
Check "GET /api/reports/sales (profit report)" { $rep.Status -eq 200 -and $null -ne $rep.Body.summary }
Check "GET /api/audit (Manager)" { (Call "GET" "/api/audit" $null $admin).Status -eq 200 }
Check "GET /api/returns (Manager)" { (Call "GET" "/api/returns" $null $admin).Status -eq 200 }
Check "GET /api/rates/history (Manager)" { (Call "GET" "/api/rates/history" $null $admin).Status -eq 200 }

# ---------------------------------------------------------------- staff limits
Section "3. Staff are limited"
Check "staff cannot open the sales report (403)" { (Call "GET" "/api/reports/sales?from=$from&to=$to" $null $staff).Status -eq 403 }
Check "staff cannot open the audit log (403)" { (Call "GET" "/api/audit" $null $staff).Status -eq 403 }
Check "staff cannot open purchases (403)" { (Call "GET" "/api/purchases" $null $staff).Status -eq 403 }
Check "staff cannot open returns (403)" { (Call "GET" "/api/returns" $null $staff).Status -eq 403 }
Check "staff cannot set a metal rate (403)" { (Call "POST" "/api/rates" @{ metalType = "Gold"; purity = "22K"; ratePerGram = 1 } $staff).Status -eq 403 }
Check "staff do not see cost prices" {
    $p = Call "GET" "/api/products" $null $staff
    $costs = @($p.Body | ForEach-Object { $_.costPrice })
    ($costs | Where-Object { $_ -ne 0 }).Count -eq 0
}

# ---------------------------------------------------------------- public receipt
Section "4. Public receipt (the QR code page)"
$orders = @((Call "GET" "/api/orders" $null $admin).Body)
if ($orders.Count -gt 0) {
    $oid = $orders[0].orderId
    $rc = Call "GET" "/api/orders/$oid/receipt" $null $admin
    Check "receipt of order $oid loads" { $rc.Status -eq 200 -and $rc.Body.publicCode }
    $code = $rc.Body.publicCode
    $pub = Call "GET" "/api/public/receipt/$code"
    Check "public receipt opens without a login" { $pub.Status -eq 200 }
    Check "public receipt hides the phone number" { $null -eq $pub.Body.customerPhone -and $null -eq $pub.Body.customerEmail }
    Check "a made-up code gives 404" { (Call "GET" "/api/public/receipt/00000000000000000000000000000000").Status -eq 404 }
} else {
    Write-Host "  (no orders yet, skipped; run with -Full to create one)" -ForegroundColor Yellow
}

# ---------------------------------------------------------------- full test
if ($Full) {
    Section "5. Full test: sale, payment, discount limit, return, stock adjustment"
    $products = @((Call "GET" "/api/products" $null $admin).Body)
    $prod = $products | Where-Object { $_.stockQuantity -ge 4 } | Select-Object -First 1
    if (-not $prod) {
        Write-Host "  No product has 4 or more pieces in stock. Restock one first, then run again." -ForegroundColor Yellow
    } else {
        $prodId = $prod.productId
        $before = $prod.stockQuantity
        $phone = "0199" + (Get-Random -Minimum 1000000 -Maximum 9999999)
        $cust = Call "POST" "/api/customers" @{ firstName = "Smoke"; lastName = "Test"; phone = $phone; email = "smoke@test.local"; address = "test" } $admin
        Check "create a test customer" { $cust.Status -eq 200 -and $cust.Body.customerId }
        $cid = $cust.Body.customerId

        # sale of 2 pieces, 10 percent discount, customer pays only 1 now
        $sale = Call "POST" "/api/orders/sale" @{
            customerId = $cid; items = @(@{ productId = $prodId; quantity = 2 }); pending = $false
            discountType = "PERCENT"; discountValue = 10; paymentMethod = "bKash"; paidAmount = 1 } $admin
        Check "sale with discount and part payment" { $sale.Status -eq 200 -and $sale.Body.discount -gt 0 -and $sale.Body.due -gt 0 }
        $oid = $sale.Body.orderId
        Check "stock went down by 2" { $now = @((Call "GET" "/api/products" $null $admin).Body | Where-Object { $_.productId -eq $prodId })[0]; $now.stockQuantity -eq ($before - 2) }

        $due = $sale.Body.due
        Check "payment of more than the due is refused (400)" { (Call "POST" "/api/orders/$oid/payments" @{ amount = ($due + 1); method = "Cash"; note = "too much" } $admin).Status -eq 400 }
        Check "take the rest of the payment" { (Call "POST" "/api/orders/$oid/payments" @{ amount = $due; method = "Cash"; note = "smoke test" } $admin).Status -eq 204 }
        $rc = Call "GET" "/api/orders/$oid/receipt" $null $admin
        Check "receipt: paid in full, due 0, two payments" { $rc.Body.dueAmount -eq 0 -and @($rc.Body.payments).Count -eq 2 }

        # staff discount limit
        $big = Call "POST" "/api/orders/sale" @{ customerId = $cid; items = @(@{ productId = $prodId; quantity = 1 }); discountType = "PERCENT"; discountValue = 50 } $staff
        Check "staff 50 percent discount is refused (400)" { $big.Status -eq 400 }

        # return one piece with a refund
        $items = @((Call "GET" "/api/orders/$oid/items" $null $admin).Body)
        $iid = $items[0].itemId
        $ret = Call "POST" "/api/returns" @{ orderId = $oid; reason = "smoke test"; items = @(@{ itemId = $iid; quantity = 1 }); refundMethod = "Cash" } $admin
        Check "return 1 piece with a refund" { $ret.Status -eq 200 -and $ret.Body.credit -gt 0 }
        Check "stock came back by 1" { $now = @((Call "GET" "/api/products" $null $admin).Body | Where-Object { $_.productId -eq $prodId })[0]; $now.stockQuantity -eq ($before - 1) }
        Check "returning more than was sold is refused (400)" { (Call "POST" "/api/returns" @{ orderId = $oid; reason = "too many"; items = @(@{ itemId = $iid; quantity = 5 }); refundMethod = "Cash" } $admin).Status -eq 400 }
        Check "an order with returned items cannot be cancelled (409)" { (Call "POST" "/api/orders/$oid/cancel" $null $admin).Status -eq 409 }
        $rc2 = Call "GET" "/api/orders/$oid/receipt" $null $admin
        Check "receipt shows the returned amount and due 0" { $rc2.Body.returnedAmount -gt 0 -and $rc2.Body.dueAmount -eq 0 }

        # stock adjustment, then put it back
        $adj = Call "POST" "/api/stock/adjust" @{ productId = $prodId; quantityChange = -1; reason = "Damaged"; note = "smoke test" } $admin
        Check "stock adjustment (damaged, -1)" { $adj.Status -eq 204 }
        Check "adjustment without a reason is refused (400)" { (Call "POST" "/api/stock/adjust" @{ productId = $prodId; quantityChange = -1; reason = "" } $admin).Status -eq 400 }
        Check "put the piece back (found, +1)" { (Call "POST" "/api/stock/adjust" @{ productId = $prodId; quantityChange = 1; reason = "Found"; note = "smoke test" } $admin).Status -eq 204 }

        # purchase from a supplier: stock up, then pay the supplier
        $sup = @((Call "GET" "/api/suppliers" $null $admin).Body)[0]
        if ($sup) {
            $stockBefore = @((Call "GET" "/api/products" $null $admin).Body | Where-Object { $_.productId -eq $prodId })[0].stockQuantity
            $uc = 1.0
            if ($prod.costPrice -gt 0) { $uc = [double]$prod.costPrice }
            $pur = Call "POST" "/api/purchases" @{ supplierId = $sup.supplierId; invoiceNo = "SMOKE"; note = "smoke test"
                items = @(@{ productId = $prodId; quantity = 1; unitCost = $uc }); paidAmount = 0; paymentMethod = "Cash" } $admin
            Check "purchase from a supplier (nothing paid yet)" { $pur.Status -eq 200 -and $pur.Body.total -gt 0 -and $pur.Body.due -eq $pur.Body.total }
            $purId = $pur.Body.purchaseId
            Check "stock went up by 1 after the purchase" { $now = @((Call "GET" "/api/products" $null $admin).Body | Where-Object { $_.productId -eq $prodId })[0]; $now.stockQuantity -eq ($stockBefore + 1) }
            Check "paying the supplier more than is owed is refused (400)" { (Call "POST" "/api/purchases/$purId/payments" @{ amount = ($pur.Body.total + 1); method = "Cash" } $admin).Status -eq 400 }
            Check "pay the supplier in full" { (Call "POST" "/api/purchases/$purId/payments" @{ amount = $pur.Body.total; method = "Cash"; note = "smoke test" } $admin).Status -eq 204 }
            Check "purchase now shows nothing owed" { $d = Call "GET" "/api/purchases/$purId" $null $admin; $d.Body.purchase.dueAmount -eq 0 -and @($d.Body.payments).Count -eq 1 }
        } else {
            Write-Host "  (no supplier yet, purchase test skipped)" -ForegroundColor Yellow
        }

        # settings round trip and audit trail
        $set = (Call "GET" "/api/settings" $null $admin).Body
        $copy = @{}; $set.PSObject.Properties | ForEach-Object { $copy[$_.Name] = [string]$_.Value }
        Check "shop settings can be saved again unchanged" { (Call "PUT" "/api/settings" $copy $admin).Status -eq 204 }
        $audit = @((Call "GET" "/api/audit" $null $admin).Body)
        Check "audit log has the sale, the return and the adjustment" {
            (($audit | Where-Object { $_.action -eq "SALE" }).Count -gt 0) -and
            (($audit | Where-Object { $_.action -eq "RETURN" }).Count -gt 0) -and
            (($audit | Where-Object { $_.action -eq "ADJUST" }).Count -gt 0)
        }
        Write-Host ""
        Write-Host "  Test data left behind: customer 'Smoke Test' ($phone) and order #$oid (partly returned)." -ForegroundColor Yellow
    }
}

# ---------------------------------------------------------------- summary
Write-Host ""
if ($script:failed.Count -eq 0) {
    Write-Host ("ALL $($script:passed) CHECKS PASSED") -ForegroundColor Green
} else {
    Write-Host ("$($script:passed) passed, $($script:failed.Count) FAILED:") -ForegroundColor Red
    $script:failed | ForEach-Object { Write-Host ("   - " + $_) -ForegroundColor Red }
    Write-Host ""
    Write-Host "Send me these lines and the 'fail:' lines from the dotnet run window." -ForegroundColor Yellow
    exit 1
}
