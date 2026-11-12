import { homedir } from 'node:os'
import { join } from 'node:path'
import { LocalStore } from './local-store.js'
import { CrmStore } from './crm-store.js'
export const name = 'dsh-erp-workbench'
export const kaneoUrl = 'http://127.0.0.1:13570'
export const twentyUrl = 'http://127.0.0.1:13580'

export async function serviceStatus(fetcher = fetch) {
  try {
    const response = await fetcher(`${kaneoUrl}/api/health`, { signal: AbortSignal.timeout(4000), redirect: 'error' })
    return { ready: response.ok, url: kaneoUrl }
  } catch { return { ready: false, url: kaneoUrl } }
}

export default {
  inject: ['webServer', 'connection'],
  apply(ctx) {
    const store = new LocalStore(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'erp-workbench'))
    const crm = new CrmStore(join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'erp-workbench'))
    ctx.effect(() => ctx.webServer.register({
      kind: 'prefix', path: '/erp-workbench',
      handler: async (req, res) => {
        const reject = ctx.get('connection')?.requestRejection
        const connection = ctx.get('connection')
        const denied = typeof reject === 'function' ? connection.requestRejection({ headers: req.headers }) : 403
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        if (denied) { res.statusCode = denied; res.end(JSON.stringify({ error: '未授权' })); return }
        try {
          const path = req.url.split('?')[0]
          let result
          if (req.method === 'GET' && path === '/erp-workbench/status') result = await serviceStatus()
          else if (req.method === 'GET' && path === '/erp-workbench/twenty-status') {
            try { const response = await fetch(`${twentyUrl}/healthz`, { signal: AbortSignal.timeout(4000), redirect: 'error' }); result = { ready: response.ok, url: twentyUrl } }
            catch { result = { ready: false, url: twentyUrl } }
          }
          else if (req.method === 'GET' && path === '/erp-workbench/local') result = await store.read()
          else if (req.method === 'GET' && path === '/erp-workbench/crm') result = await crm.read()
          else if (req.method === 'POST' && ['/erp-workbench/local', '/erp-workbench/crm'].includes(path)) {
            const chunks = []; let length = 0
            for await (const chunk of req) {
              length += chunk.length
              if (length > 32000) throw Object.assign(new Error('提交内容过大。'), { status: 413 })
              chunks.push(chunk)
            }
            let command
            try { command = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw Object.assign(new Error('提交内容无效。'), { status: 400 }) }
            if (!command || typeof command !== 'object' || command.action === 'initialize') throw Object.assign(new Error('操作无效。'), { status: 400 })
            result = await (path === '/erp-workbench/crm' ? crm : store).change(command)
          } else { res.statusCode = 404; res.end('{}'); return }
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = error.status || 500
          res.end(JSON.stringify({ error: error.status ? error.message : '本地数据读写失败，请检查磁盘空间与数据文件。' }))
        }
      },
    }), 'ERP 工作台连接状态')
  },
}
