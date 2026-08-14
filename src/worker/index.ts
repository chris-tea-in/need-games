import { handleRequest } from './router.js'

export default {
  fetch(request, env): Promise<Response> {
    return handleRequest(request, env)
  },
} satisfies ExportedHandler<Env>
