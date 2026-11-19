# AURALUCIS Owner and Public Catalogue Update

## Before installation

For a completely fresh installation:

1. Use an empty Oracle schema.
2. Run `database/install_all.sql` from the database folder as the schema owner.
3. Check `install_log.txt` and confirm the installation check reports `ALL GOOD`.
4. Keep the backend stopped.
5. From the project root, run the local Owner bootstrap command:

   `dotnet run --project backend/JewelryApi -- --bootstrap-owner`

6. Follow the prompts to create the first Owner account.
7. Start the backend and frontend.

The bootstrap command asks for the Owner name, username, email and password. The password is entered without being displayed. It refuses to create another Owner if one already exists.

For an existing database, do not run the full installer or rerun migrations that have already been applied. Back up the database and apply only the required unapplied upgrade scripts.

The SQL migration adds schema columns only. It never creates, renames or resets employee accounts.

## Cloudinary configuration

Set these environment variables on the backend machine (never in frontend `.env` files or Git):

- `Cloudinary__CloudName`
- `Cloudinary__ApiKey`
- `Cloudinary__ApiSecret`

Images must be JPG, PNG or WEBP and no larger than 5 MB. The API uploads images into the `auralucis/products` Cloudinary folder and stores the secure URL in Oracle.

## Email password recovery

Configure SMTP using the existing `Email__Host`, `Email__Port`, `Email__User`, `Email__Password`, `Email__From` and `Email__EnableSsl` environment variables. Set `App__PublicUrl` to the public frontend URL. Use the email address entered when the Owner account was created. Reset links expire after one hour.

## Public catalogue

Install the new frontend icon dependency once with `npm install` (this updates `package-lock.json` for `lucide-react`), then run `npm run build`.

The public catalogue is the frontend root (`/`). Only products with `is_published = 1` appear. Owner and Manager can upload images and publish products from Products. The public API exposes product description, image, metal details and selling price only; it does not expose cost price, supplier details or internal stock quantities.

Receipt verification remains at `/verify/<code>`.

## Account permissions

- Owner can create, edit, rename, reset and deactivate Manager and Staff accounts.
- Manager can manage Staff accounts only.
- Deactivation is used instead of physical deletion to preserve historical sales and audit records.
- Staff cannot manage accounts.

