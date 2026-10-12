# Account deletion function

`POST /functions/v1/delete-account` authenticates the caller, records a deletion request without retaining a foreign key to the auth user, and removes the Supabase Auth user. Cascading patient data deletion is provided by the database relationships.

The client must sign out locally after a successful response. Local SQLite records are deliberately separate and require an explicit local-delete action so the user can export them first.
