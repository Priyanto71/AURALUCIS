using System.Net.Mail;
using System.Text.RegularExpressions;
using Dapper;
using JewelryApi.Data;
using Oracle.ManagedDataAccess.Client;

namespace JewelryApi.Auth;

internal static class OwnerBootstrapper
{
    public static async Task<int> RunAsync(string connectionString)
    {
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            Console.Error.WriteLine("Oracle connection string is missing.");
            return 1;
        }

        if (Console.IsInputRedirected)
        {
            Console.Error.WriteLine("Run this command directly in an interactive terminal.");
            return 1;
        }

        try
        {
            Console.WriteLine("AURALUCIS - Initial Owner Setup");
            Console.WriteLine("--------------------------------");

            var firstName = ReadRequired("First name", 100);
            var lastName = ReadRequired("Last name", 100);
            var username = ReadRequired("Username", 50);

            if (!Regex.IsMatch(username, @"^[A-Za-z0-9._-]{3,50}$"))
            {
                Console.Error.WriteLine("Username must be 3-50 characters: letters, numbers, dots, underscores or hyphens.");
                return 1;
            }

            var email = ReadRequired("Email", 100);

            try
            {
                var address = new MailAddress(email);
                if (address.Address != email)
                    throw new FormatException();
            }
            catch
            {
                Console.Error.WriteLine("Enter a valid email address.");
                return 1;
            }

            Console.WriteLine("Password must contain at least 12 characters.");
            var password = ReadHidden("Password: ");
            var confirmation = ReadHidden("Confirm password: ");

            if (password.Length < 12)
            {
                Console.Error.WriteLine("Password is too short.");
                return 1;
            }

            if (password != confirmation)
            {
                Console.Error.WriteLine("Passwords do not match.");
                return 1;
            }

            var passwordHash = PasswordHasher.Hash(password);
            password = string.Empty;
            confirmation = string.Empty;

            await using var connection = new OracleConnection(connectionString);
            await connection.OpenAsync();

            using var transaction = connection.BeginTransaction();

            // Serialize bootstrap attempts so two terminals cannot create Owners together.
            await connection.ExecuteAsync(
                "LOCK TABLE employees IN EXCLUSIVE MODE",
                transaction: transaction);

            const string requiredColumnsSql = @"
                SELECT COUNT(*)
                FROM user_tab_columns
                WHERE table_name = 'EMPLOYEES'
                  AND column_name IN (
                    'EMPLOYEE_ID', 'FIRST_NAME', 'LAST_NAME', 'ROLE',
                    'EMAIL', 'USERNAME', 'PASSWORD_HASH',
                    'IS_ACTIVE', 'MUST_CHANGE_PASSWORD'
                  )";

            var columnCount = await connection.ExecuteScalarAsync<int>(
                requiredColumnsSql, transaction: transaction);

            if (columnCount != 9)
            {
                transaction.Rollback();
                Console.Error.WriteLine("Required employee columns are missing. Complete the database migrations first.");
                return 1;
            }

            var sequenceExists = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM user_sequences WHERE sequence_name = 'EMPLOYEES_SEQ'",
                transaction: transaction);

            if (sequenceExists != 1)
            {
                transaction.Rollback();
                Console.Error.WriteLine("employees_seq is missing. Check the database installation.");
                return 1;
            }

            var ownerCount = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM employees WHERE UPPER(TRIM(role)) = 'OWNER'",
                transaction: transaction);

            if (ownerCount > 0)
            {
                transaction.Rollback();
                Console.Error.WriteLine("An Owner account already exists. No changes were made.");
                return 1;
            }

            var usernameCount = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM employees WHERE LOWER(username) = LOWER(:username)",
                new { username }, transaction);

            if (usernameCount > 0)
            {
                transaction.Rollback();
                Console.Error.WriteLine("That username is already in use.");
                return 1;
            }

            var emailCount = await connection.ExecuteScalarAsync<int>(
                "SELECT COUNT(*) FROM employees WHERE LOWER(email) = LOWER(:email)",
                new { email }, transaction);

            if (emailCount > 0)
            {
                transaction.Rollback();
                Console.Error.WriteLine("That email is already in use.");
                return 1;
            }

            var employeeId = await connection.ExecuteScalarAsync<int>(
                "SELECT employees_seq.NEXTVAL FROM dual",
                transaction: transaction);

            const string insertSql = @"
                INSERT INTO employees (
                    employee_id, first_name, last_name, role, email,
                    username, password_hash, is_active, must_change_password
                )
                VALUES (
                    :employeeId, :firstName, :lastName, 'Owner', :email,
                    :username, :passwordHash, 1, 0
                )";

            await connection.ExecuteAsync(
                insertSql,
                new
                {
                    employeeId,
                    firstName,
                    lastName,
                    email,
                    username,
                    passwordHash
                },
                transaction);

            transaction.Commit();

            Console.WriteLine();
            Console.WriteLine("Owner account created successfully.");
            Console.WriteLine("You can now start the AURALUCIS backend.");
            return 0;
        }
        catch (OracleException ex)
        {
            Console.Error.WriteLine($"Oracle database error ({ex.Number}). Bootstrap was not completed.");
            return 1;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Bootstrap failed: {ex.Message}");
            return 1;
        }
    }

    private static string ReadRequired(string label, int maxLength)
    {
        while (true)
        {
            Console.Write($"{label}: ");
            var value = (Console.ReadLine() ?? string.Empty).Trim();

            if (value.Length > 0 && value.Length <= maxLength)
                return value;

            Console.WriteLine($"Enter a value between 1 and {maxLength} characters.");
        }
    }

    private static string ReadHidden(string prompt)
    {
        Console.Write(prompt);
        var value = new System.Text.StringBuilder();

        while (true)
        {
            var key = Console.ReadKey(intercept: true);

            if (key.Key == ConsoleKey.Enter)
            {
                Console.WriteLine();
                return value.ToString();
            }

            if (key.Key == ConsoleKey.Backspace)
            {
                if (value.Length > 0)
                    value.Length--;

                continue;
            }

            if (!char.IsControl(key.KeyChar))
                value.Append(key.KeyChar);
        }
    }
}
