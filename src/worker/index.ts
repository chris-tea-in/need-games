export default {
  fetch(): Response {
    return new Response('Need Games closed beta is not ready.', { status: 503 })
  },
} satisfies ExportedHandler<Env>
