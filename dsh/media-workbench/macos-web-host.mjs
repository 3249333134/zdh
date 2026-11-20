import { canvasSession } from './macos-native.cjs';

const canvasWeb = 'http://127.0.0.1:13001';

export default {
  inject: ['webServer', 'connection'],
  apply(ctx) {
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix',
      path: '/media-workbench',
      async handler(req, res) {
        function json(status, value) {
          res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(value));
        }
        const rejection = ctx.connection.requestRejection({ headers: req.headers });
        if (rejection) return json(rejection, { error: '请先打开已授权的自媒体工作台' });
        if (req.method !== 'GET') return json(405, { error: '方法不受支持' });
        const url = new URL(req.url, 'http://127.0.0.1:33280');
        try {
          if (url.pathname === '/media-workbench/canvas') {
            const target = url.searchParams.get('target') || '/create';
            if (!/^\/(?:create|projects\/[\w-]+|canvas\/[\w-]+)$/.test(target)) return json(400, { error: '影策页面地址无效' });
            const { value } = await canvasSession();
            res.writeHead(303, {
              location: canvasWeb + target,
              'cache-control': 'no-store',
              'set-cookie': `open_ai_canvas_session=${value}; Path=/; HttpOnly; SameSite=Strict`,
            });
            return res.end();
          }
          return json(404, { error: '工作台接口不存在' });
        } catch {
          return json(503, { error: '本机影策暂不可用，请通过启动入口检查服务后重试。' });
        }
      },
    }), 'macOS 自媒体工作台');
  },
};
