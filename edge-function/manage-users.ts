// Supabase Edge Function: manage-users
// Lets the ADMIN add / remove staff and reset passwords from inside MedCert.
// Paste this whole file into Supabase > Edge Functions > Deploy a new function > Via Editor.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // 1. Who is calling?
    const caller = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') || '' } } })
    const { data: u } = await caller.auth.getUser()
    const me = (u?.user?.email || '').toLowerCase()
    if (!me) return json({ error: 'Not logged in.' }, 401)

    // 2. Are they the admin?
    const admin = createClient(url, svc)
    const { data: row } = await admin.from('staff_emails').select('role').eq('email', me).maybeSingle()
    if (!row || row.role !== 'admin') return json({ error: 'Only the admin can manage users.' }, 403)

    const body = await req.json().catch(() => ({}))
    const action = body.action
    const email = String(body.email || '').trim().toLowerCase()
    const password = String(body.password || '')

    const findAuthUser = async (target: string) => {
      for (let page = 1; page < 50; page++) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        const hit = data.users.find((x) => (x.email || '').toLowerCase() === target)
        if (hit) return hit
        if (data.users.length < 1000) break
      }
      return null
    }
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)

    if (action === 'list') {
      const { data, error } = await admin.from('staff_emails').select('email, role').order('role').order('email')
      if (error) throw error
      return json({ users: data })
    }

    if (action === 'add') {
      if (!validEmail) return json({ error: 'Please enter a valid e-mail address.' }, 400)
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400)
      const existing = await findAuthUser(email)
      if (existing) {
        const { error } = await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
        if (error) throw error
      } else {
        const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
        if (error) throw error
      }
      const { error: e2 } = await admin.from('staff_emails').upsert({ email, role: 'staff' }, { onConflict: 'email', ignoreDuplicates: true })
      if (e2) throw e2
      return json({ ok: true })
    }

    if (action === 'reset') {
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400)
      const target = await findAuthUser(email)
      if (!target) return json({ error: 'That user has no login account.' }, 404)
      const { error } = await admin.auth.admin.updateUserById(target.id, { password })
      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'remove') {
      if (email === me) return json({ error: 'You cannot remove your own account.' }, 400)
      const { data: t } = await admin.from('staff_emails').select('role').eq('email', email).maybeSingle()
      if (t && t.role === 'admin') return json({ error: 'The admin account cannot be removed.' }, 400)
      const { error } = await admin.from('staff_emails').delete().eq('email', email)
      if (error) throw error
      const target = await findAuthUser(email)
      if (target) await admin.auth.admin.deleteUser(target.id)
      return json({ ok: true })
    }

    return json({ error: 'Unknown action.' }, 400)
  } catch (err) {
    return json({ error: (err as Error).message || String(err) }, 500)
  }
})
