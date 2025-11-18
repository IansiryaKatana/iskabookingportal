do $$
begin
  perform pg_notify('pgrst', 'reload schema');
end;
$$;

