export function handleHealthCheck(): Response {
  return Response.json(
    { status: 'ok' },
    {
      headers: { 'content-type': 'application/json; charset=utf-8' },
    },
  );
}
