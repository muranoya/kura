(async ()=>{
    const Q = "/assets/vault_core_bg-BR5Sab9T.wasm", X = async (e = {}, n)=>{
        let r;
        if (n.startsWith("data:")) {
            const t = n.replace(/^data:.*?base64,/, "");
            let _;
            if (typeof Buffer == "function" && typeof Buffer.from == "function") _ = Buffer.from(t, "base64");
            else if (typeof atob == "function") {
                const l = atob(t);
                _ = new Uint8Array(l.length);
                for(let c = 0; c < l.length; c++)_[c] = l.charCodeAt(c);
            } else throw new Error("Cannot decode base64-encoded data URL");
            r = await WebAssembly.instantiate(_, e);
        } else {
            const t = await fetch(n), _ = t.headers.get("Content-Type") || "";
            if ("instantiateStreaming" in WebAssembly && _.startsWith("application/wasm")) r = await WebAssembly.instantiateStreaming(t, e);
            else {
                const l = await t.arrayBuffer();
                r = await WebAssembly.instantiate(l, e);
            }
        }
        return r.instance.exports;
    };
    function Z(e, n) {
        const r = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), t = o, _ = s(n, a.__wbindgen_malloc, a.__wbindgen_realloc), l = o, c = a.api_change_master_password(r, t, _, l);
        if (c[1]) throw f(c[0]);
    }
    function R(e, n, r, t, _, l) {
        let c, i;
        try {
            const m = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), g = o, M = s(n, a.__wbindgen_malloc, a.__wbindgen_realloc), x = o;
            var d = b(r) ? 0 : s(r, a.__wbindgen_malloc, a.__wbindgen_realloc), T = o;
            const O = s(t, a.__wbindgen_malloc, a.__wbindgen_realloc), q = o, z = F(_, a.__wbindgen_malloc), H = o;
            var E = b(l) ? 0 : s(l, a.__wbindgen_malloc, a.__wbindgen_realloc), A = o;
            const V = a.api_create_entry(m, g, M, x, d, T, O, q, z, H, E, A);
            var h = V[0], w = V[1];
            if (V[3]) throw h = 0, w = 0, f(V[2]);
            return c = h, i = w, y(h, w);
        } finally{
            a.__wbindgen_free(c, i, 1);
        }
    }
    function ee(e) {
        let n, r;
        try {
            const l = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), c = o, i = a.api_create_label(l, c);
            var t = i[0], _ = i[1];
            if (i[3]) throw t = 0, _ = 0, f(i[2]);
            return n = t, r = _, y(t, _);
        } finally{
            a.__wbindgen_free(n, r, 1);
        }
    }
    function te(e) {
        let n, r;
        try {
            const l = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), c = o, i = a.api_create_new_vault(l, c);
            var t = i[0], _ = i[1];
            if (i[3]) throw t = 0, _ = 0, f(i[2]);
            return n = t, r = _, y(t, _);
        } finally{
            a.__wbindgen_free(n, r, 1);
        }
    }
    function re(e) {
        const n = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), r = o, t = a.api_delete_entry(n, r);
        if (t[1]) throw f(t[0]);
    }
    function ne(e) {
        const n = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), r = o, t = a.api_delete_label(n, r);
        if (t[1]) throw f(t[0]);
    }
    function ae(e) {
        let n, r;
        try {
            const l = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), c = o, i = a.api_get_entry(l, c);
            var t = i[0], _ = i[1];
            if (i[3]) throw t = 0, _ = 0, f(i[2]);
            return n = t, r = _, y(t, _);
        } finally{
            a.__wbindgen_free(n, r, 1);
        }
    }
    function Y() {
        const e = a.api_get_vault_bytes();
        if (e[3]) throw f(e[2]);
        var n = C(e[0], e[1]).slice();
        return a.__wbindgen_free(e[0], e[1] * 1, 1), n;
    }
    function G(e, n, r, t, _) {
        let l, c;
        try {
            var i = b(e) ? 0 : s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), d = o, T = b(n) ? 0 : s(n, a.__wbindgen_malloc, a.__wbindgen_realloc), E = o, A = b(r) ? 0 : s(r, a.__wbindgen_malloc, a.__wbindgen_realloc), h = o;
            const g = a.api_list_entries(i, d, T, E, A, h, t, _);
            var w = g[0], m = g[1];
            if (g[3]) throw w = 0, m = 0, f(g[2]);
            return l = w, c = m, y(w, m);
        } finally{
            a.__wbindgen_free(l, c, 1);
        }
    }
    function _e() {
        let e, n;
        try {
            const _ = a.api_list_labels();
            var r = _[0], t = _[1];
            if (_[3]) throw r = 0, t = 0, f(_[2]);
            return e = r, n = t, y(r, t);
        } finally{
            a.__wbindgen_free(e, n, 1);
        }
    }
    function ce(e, n) {
        const r = Ge(e, a.__wbindgen_malloc), t = o, _ = s(n, a.__wbindgen_malloc, a.__wbindgen_realloc), l = o, c = a.api_load_vault(r, t, _, l);
        if (c[1]) throw f(c[0]);
    }
    function K() {
        const e = a.api_lock();
        if (e[3]) throw f(e[2]);
        var n = C(e[0], e[1]).slice();
        return a.__wbindgen_free(e[0], e[1] * 1, 1), n;
    }
    function oe(e) {
        const n = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), r = o, t = a.api_purge_entry(n, r);
        if (t[1]) throw f(t[0]);
    }
    function le(e) {
        const n = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), r = o, t = a.api_restore_entry(n, r);
        if (t[1]) throw f(t[0]);
    }
    function ie(e, n) {
        const r = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), t = o, _ = F(n, a.__wbindgen_malloc), l = o, c = a.api_set_entry_labels(r, t, _, l);
        if (c[1]) throw f(c[0]);
    }
    function se(e, n) {
        const r = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), t = o, _ = a.api_set_favorite(r, t, n);
        if (_[1]) throw f(_[0]);
    }
    function ue(e) {
        const n = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), r = o, t = a.api_unlock(n, r);
        if (t[1]) throw f(t[0]);
    }
    function fe(e) {
        const n = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), r = o, t = a.api_unlock_with_recovery_key(n, r);
        if (t[1]) throw f(t[0]);
    }
    function be(e, n, r, t, _, l) {
        const c = s(e, a.__wbindgen_malloc, a.__wbindgen_realloc), i = o;
        var d = b(n) ? 0 : s(n, a.__wbindgen_malloc, a.__wbindgen_realloc), T = o, E = b(r) ? 0 : s(r, a.__wbindgen_malloc, a.__wbindgen_realloc), A = o, h = b(t) ? 0 : s(t, a.__wbindgen_malloc, a.__wbindgen_realloc), w = o, m = b(_) ? 0 : F(_, a.__wbindgen_malloc), g = o, M = b(l) ? 0 : s(l, a.__wbindgen_malloc, a.__wbindgen_realloc), x = o;
        const O = a.api_update_entry(c, i, d, T, E, A, h, w, m, g, M, x);
        if (O[1]) throw f(O[0]);
    }
    function de(e) {
        return typeof e == "function";
    }
    function we(e) {
        const n = e;
        return typeof n == "object" && n !== null;
    }
    function ge(e) {
        return typeof e == "string";
    }
    function ye(e) {
        return e === void 0;
    }
    function he(e, n) {
        const r = n, t = typeof r == "string" ? r : void 0;
        var _ = b(t) ? 0 : s(t, a.__wbindgen_malloc, a.__wbindgen_realloc), l = o;
        $().setInt32(e + 4 * 1, l, !0), $().setInt32(e + 4 * 0, _, !0);
    }
    function me(e, n) {
        throw new Error(y(e, n));
    }
    function pe() {
        return I(function(e, n, r) {
            return e.call(n, r);
        }, arguments);
    }
    function ve(e) {
        return e.crypto;
    }
    function ke() {
        return I(function(e, n) {
            globalThis.crypto.getRandomValues(C(e, n));
        }, arguments);
    }
    function Se() {
        return I(function(e, n) {
            e.getRandomValues(n);
        }, arguments);
    }
    function Te(e) {
        return e.getTime();
    }
    function Ee(e) {
        return e.length;
    }
    function Ae(e) {
        return e.msCrypto;
    }
    function Le() {
        return new Date;
    }
    function Ce(e) {
        return new Uint8Array(e >>> 0);
    }
    function Ie(e) {
        return e.node;
    }
    function Oe(e) {
        return e.process;
    }
    function Ve(e, n, r) {
        Uint8Array.prototype.set.call(C(e, n), r);
    }
    function Be() {
        return I(function(e, n) {
            e.randomFillSync(n);
        }, arguments);
    }
    function Ne() {
        return I(function() {
            return module.require;
        }, arguments);
    }
    function We() {
        const e = typeof global > "u" ? null : global;
        return b(e) ? 0 : S(e);
    }
    function Me() {
        const e = typeof globalThis > "u" ? null : globalThis;
        return b(e) ? 0 : S(e);
    }
    function xe() {
        const e = typeof self > "u" ? null : self;
        return b(e) ? 0 : S(e);
    }
    function Ue() {
        const e = typeof window > "u" ? null : window;
        return b(e) ? 0 : S(e);
    }
    function De(e, n, r) {
        return e.subarray(n >>> 0, r >>> 0);
    }
    function $e(e) {
        return e.versions;
    }
    function Fe(e, n) {
        return C(e, n);
    }
    function Pe(e, n) {
        return y(e, n);
    }
    function Ye() {
        const e = a.__wbindgen_externrefs, n = e.grow(4);
        e.set(0, void 0), e.set(n + 0, void 0), e.set(n + 1, null), e.set(n + 2, !0), e.set(n + 3, !1);
    }
    function S(e) {
        const n = a.__externref_table_alloc();
        return a.__wbindgen_externrefs.set(n, e), n;
    }
    function C(e, n) {
        return e = e >>> 0, k().subarray(e / 1, e / 1 + n);
    }
    let v = null;
    function $() {
        return (v === null || v.buffer.detached === !0 || v.buffer.detached === void 0 && v.buffer !== a.memory.buffer) && (v = new DataView(a.memory.buffer)), v;
    }
    function y(e, n) {
        return e = e >>> 0, Ke(e, n);
    }
    let B = null;
    function k() {
        return (B === null || B.byteLength === 0) && (B = new Uint8Array(a.memory.buffer)), B;
    }
    function I(e, n) {
        try {
            return e.apply(this, n);
        } catch (r) {
            const t = S(r);
            a.__wbindgen_exn_store(t);
        }
    }
    function b(e) {
        return e == null;
    }
    function Ge(e, n) {
        const r = n(e.length * 1, 1) >>> 0;
        return k().set(e, r / 1), o = e.length, r;
    }
    function F(e, n) {
        const r = n(e.length * 4, 4) >>> 0;
        for(let t = 0; t < e.length; t++){
            const _ = S(e[t]);
            $().setUint32(r + 4 * t, _, !0);
        }
        return o = e.length, r;
    }
    function s(e, n, r) {
        if (r === void 0) {
            const i = L.encode(e), d = n(i.length, 1) >>> 0;
            return k().subarray(d, d + i.length).set(i), o = i.length, d;
        }
        let t = e.length, _ = n(t, 1) >>> 0;
        const l = k();
        let c = 0;
        for(; c < t; c++){
            const i = e.charCodeAt(c);
            if (i > 127) break;
            l[_ + c] = i;
        }
        if (c !== t) {
            c !== 0 && (e = e.slice(c)), _ = r(_, t, t = c + e.length * 3, 1) >>> 0;
            const i = k().subarray(_ + c, _ + t), d = L.encodeInto(e, i);
            c += d.written, _ = r(_, t, c, 1) >>> 0;
        }
        return o = c, _;
    }
    function f(e) {
        const n = a.__wbindgen_externrefs.get(e);
        return a.__externref_table_dealloc(e), n;
    }
    let N = new TextDecoder("utf-8", {
        ignoreBOM: !0,
        fatal: !0
    });
    N.decode();
    const Je = 2146435072;
    let U = 0;
    function Ke(e, n) {
        return U += n, U >= Je && (N = new TextDecoder("utf-8", {
            ignoreBOM: !0,
            fatal: !0
        }), N.decode(), U = n), N.decode(k().subarray(e, e + n));
    }
    const L = new TextEncoder;
    "encodeInto" in L || (L.encodeInto = function(e, n) {
        const r = L.encode(e);
        return n.set(r), {
            read: e.length,
            written: r.length
        };
    });
    let o = 0, a;
    function je(e) {
        a = e;
    }
    URL = globalThis.URL;
    const qe = await X({
        "./vault_core_bg.js": {
            __wbg_getRandomValues_a1cf2e70b003a59d: ke,
            __wbg_crypto_38df2bab126b63dc: ve,
            __wbg_process_44c7a14e11e9f69e: Oe,
            __wbg_versions_276b2795b1c6a219: $e,
            __wbg_node_84ea875411254db1: Ie,
            __wbg_require_b4edbdcf3e2a1ef0: Ne,
            __wbg_call_2d781c1f4d5c0ef8: pe,
            __wbg_msCrypto_bd5a034af96bcba6: Ae,
            __wbg_randomFillSync_6c25eac9869eb53c: Be,
            __wbg_getRandomValues_c44a50d8cfdaebeb: Se,
            __wbg_length_ea16607d7b61445b: Ee,
            __wbg_prototypesetcall_d62e5099504357e6: Ve,
            __wbg_new_with_length_825018a1616e9e55: Ce,
            __wbg_subarray_a068d24e39478a8a: De,
            __wbg_new_0_1dcafdf5e786e876: Le,
            __wbg_getTime_1dad7b5386ddd2d9: Te,
            __wbg_static_accessor_GLOBAL_THIS_ad356e0db91c7913: Me,
            __wbg_static_accessor_SELF_f207c857566db248: xe,
            __wbg_static_accessor_GLOBAL_8adb955bd33fac2f: We,
            __wbg_static_accessor_WINDOW_bb9f1ba69d61b386: Ue,
            __wbg___wbindgen_throw_6ddd609b62940d55: me,
            __wbg___wbindgen_is_object_781bc9f159099513: we,
            __wbg___wbindgen_is_string_7ef6b97b02428fae: ge,
            __wbg___wbindgen_string_get_395e606bd0ee4427: he,
            __wbg___wbindgen_is_function_3c846841762788c1: de,
            __wbg___wbindgen_is_undefined_52709e72fb9f179c: ye,
            __wbindgen_init_externref_table: Ye,
            __wbindgen_cast_0000000000000001: Fe,
            __wbindgen_cast_0000000000000002: Pe
        }
    }, Q), { memory: ze, api_change_master_password: He, api_create_entry: Qe, api_create_label: Xe, api_create_new_vault: Ze, api_delete_entry: Re, api_delete_label: et, api_generate_password: tt, api_generate_totp: rt, api_generate_totp_default: nt, api_get_entry: at, api_get_vault_bytes: _t, api_list_entries: ct, api_list_labels: ot, api_load_vault: lt, api_lock: it, api_purge_entry: st, api_regenerate_recovery_key: ut, api_rename_label: ft, api_restore_entry: bt, api_rotate_dek: dt, api_set_entry_labels: wt, api_set_favorite: gt, api_unlock: yt, api_unlock_with_recovery_key: ht, api_update_entry: mt, api_upgrade_argon2_params: pt, __wbindgen_malloc: vt, __wbindgen_realloc: kt, __wbindgen_exn_store: St, __externref_table_alloc: Tt, __wbindgen_externrefs: Et, __externref_table_dealloc: At, __wbindgen_free: Lt, __wbindgen_start: j } = qe, Ct = Object.freeze(Object.defineProperty({
        __proto__: null,
        __externref_table_alloc: Tt,
        __externref_table_dealloc: At,
        __wbindgen_exn_store: St,
        __wbindgen_externrefs: Et,
        __wbindgen_free: Lt,
        __wbindgen_malloc: vt,
        __wbindgen_realloc: kt,
        __wbindgen_start: j,
        api_change_master_password: He,
        api_create_entry: Qe,
        api_create_label: Xe,
        api_create_new_vault: Ze,
        api_delete_entry: Re,
        api_delete_label: et,
        api_generate_password: tt,
        api_generate_totp: rt,
        api_generate_totp_default: nt,
        api_get_entry: at,
        api_get_vault_bytes: _t,
        api_list_entries: ct,
        api_list_labels: ot,
        api_load_vault: lt,
        api_lock: it,
        api_purge_entry: st,
        api_regenerate_recovery_key: ut,
        api_rename_label: ft,
        api_restore_entry: bt,
        api_rotate_dek: dt,
        api_set_entry_labels: wt,
        api_set_favorite: gt,
        api_unlock: yt,
        api_unlock_with_recovery_key: ht,
        api_update_entry: mt,
        api_upgrade_argon2_params: pt,
        memory: ze
    }, Symbol.toStringTag, {
        value: "Module"
    }));
    je(Ct);
    j();
    async function W(e) {
        return new Promise((n)=>{
            chrome.storage.local.get([
                e
            ], (r)=>{
                n(r[e]);
            });
        });
    }
    async function p(e, n) {
        return new Promise((r)=>{
            chrome.storage.local.set({
                [e]: n
            }, ()=>{
                r();
            });
        });
    }
    let J = !1, u = !1;
    async function P() {
        if (!J) try {
            J = !0, console.log("[SW] WASM initialized");
        } catch (e) {
            throw console.error("[SW] WASM initialization error:", e), e;
        }
    }
    self.addEventListener("install", (e)=>{
        e.waitUntil(P());
    });
    self.addEventListener("activate", (e)=>{
        e.waitUntil(P().then(()=>{
            It(), Vt();
        }));
    });
    function It() {
        chrome.runtime.onMessage.addListener((e, n, r)=>(Ot(e, n, r), !0));
    }
    async function Ot(e, n, r) {
        try {
            switch(await P(), e.type){
                case "IS_UNLOCKED":
                    {
                        r({
                            unlocked: u
                        });
                        break;
                    }
                case "UNLOCK":
                    {
                        if (!e.password) {
                            r({
                                success: !1,
                                error: "Password required"
                            });
                            break;
                        }
                        try {
                            const t = await W("vaultBytes"), _ = await W("vaultEtag");
                            if (!t) {
                                r({
                                    success: !1,
                                    error: "Vault not found"
                                });
                                break;
                            }
                            ce(new Uint8Array(t), _ || ""), ue(e.password), u = !0;
                            const l = await D();
                            chrome.alarms.create("autolock", {
                                delayInMinutes: l.autolockMinutes
                            }), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "RECOVER":
                    {
                        if (!e.recoveryKey || !e.newPassword) {
                            r({
                                success: !1,
                                error: "Recovery key and password required"
                            });
                            break;
                        }
                        try {
                            fe(e.recoveryKey), Z(e.recoveryKey, e.newPassword);
                            const t = Y();
                            await p("vaultBytes", Array.from(t)), await p("vaultEtag", null), u = !0, r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "LOCK":
                    {
                        try {
                            const t = K();
                            await p("vaultBytes", Array.from(t)), u = !1, chrome.alarms.clear("autolock"), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "CREATE_VAULT":
                    {
                        if (!e.masterPassword) {
                            r({
                                success: !1,
                                error: "Master password required"
                            });
                            break;
                        }
                        try {
                            const t = te(e.masterPassword), _ = Y();
                            await p("vaultBytes", Array.from(_)), await p("vaultEtag", null), u = !0, r({
                                success: !0,
                                recoveryKey: t
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "LIST_ENTRIES":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            const t = e.filter || {}, _ = G(t.searchQuery || null, t.type || null, t.labelId || null, t.includeTrash || !1), l = JSON.parse(_);
                            r({
                                success: !0,
                                entries: l
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "GET_ENTRY":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            const t = ae(e.id), _ = JSON.parse(t);
                            _ && _.typed_value && typeof _.typed_value == "string" && (_.typed_value = JSON.parse(_.typed_value)), r({
                                success: !0,
                                entry: _
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "CREATE_ENTRY":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            R(e.entryType, e.name, e.notes || null, JSON.stringify(e.typed_value || {}), e.labelIds || []), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "UPDATE_ENTRY":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            be(e.id, e.name, e.notes || null, JSON.stringify(e.typed_value || {}), e.labelIds || []), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "DELETE_ENTRY":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            re(e.id), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "RESTORE_ENTRY":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            le(e.id), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "PURGE_ENTRY":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            oe(e.id), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "SET_FAVORITE":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            se(e.id, e.isFavorite), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "LIST_TRASH":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            const t = G(null, null, null, !0), _ = JSON.parse(t);
                            r({
                                success: !0,
                                entries: _
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "LIST_LABELS":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            const t = _e(), _ = JSON.parse(t);
                            r({
                                success: !0,
                                labels: _
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "CREATE_LABEL":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            const t = ee(e.name);
                            r({
                                success: !0,
                                label: {
                                    id: t,
                                    name: e.name
                                }
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "DELETE_LABEL":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            ne(e.id), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "SET_ENTRY_LABELS":
                    {
                        if (!u) {
                            r({
                                success: !1,
                                error: "Vault not unlocked"
                            });
                            break;
                        }
                        try {
                            ie(e.entryId, e.labelIds || []), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "SYNC":
                    {
                        r({
                            success: !0,
                            status: "idle"
                        });
                        break;
                    }
                case "GET_SYNC_STATUS":
                    {
                        const t = await W("lastSyncTime");
                        r({
                            success: !0,
                            status: "idle",
                            lastSyncTime: t
                        });
                        break;
                    }
                case "GET_SYNC_CONFLICTS":
                    {
                        r({
                            success: !0,
                            conflicts: []
                        });
                        break;
                    }
                case "RESOLVE_SYNC_CONFLICTS":
                    {
                        r({
                            success: !0
                        });
                        break;
                    }
                case "GET_SETTINGS":
                    {
                        const t = await D();
                        r({
                            success: !0,
                            settings: t
                        });
                        break;
                    }
                case "SAVE_SETTINGS":
                    {
                        try {
                            await p("settings", e.settings), u && chrome.alarms.create("autolock", {
                                delayInMinutes: e.settings.autolockMinutes
                            }), r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                case "CLIPBOARD_COPIED":
                    {
                        try {
                            const t = await D();
                            if (t.clipboardAutoClean) {
                                const _ = t.clipboardClearSeconds / 60;
                                chrome.alarms.create("clipboard-clear", {
                                    delayInMinutes: _
                                });
                            }
                            r({
                                success: !0
                            });
                        } catch (t) {
                            r({
                                success: !1,
                                error: String(t)
                            });
                        }
                        break;
                    }
                default:
                    r({
                        error: "Unknown message type"
                    });
            }
        } catch (t) {
            console.error("[SW] Message handling error:", t), r({
                error: String(t)
            });
        }
    }
    async function D() {
        return await W("settings") || {
            autolockMinutes: 5,
            clipboardClearSeconds: 30,
            clipboardAutoClean: !0
        };
    }
    function Vt() {
        chrome.alarms.create("autolock", {
            delayInMinutes: 5
        }), chrome.alarms.onAlarm.addListener((e)=>{
            e.name === "autolock" ? Bt() : e.name === "clipboard-clear" && Nt();
        });
    }
    async function Bt() {
        if (console.log("[SW] Autolock alarm triggered"), !!u) try {
            const e = K();
            await p("vaultBytes", Array.from(e)), u = !1, console.log("[SW] Vault locked");
        } catch (e) {
            console.error("[SW] Autolock failed:", e);
        }
    }
    async function Nt() {
        console.log("[SW] Clipboard clear alarm triggered");
        try {
            typeof chrome.offscreen < "u" ? (await chrome.offscreen.createDocument({
                url: chrome.runtime.getURL("src/background/offscreen.html"),
                reasons: [
                    "CLIPBOARD"
                ],
                justification: "Clear clipboard after copy timeout"
            }), chrome.runtime.sendMessage({
                type: "CLEAR_CLIPBOARD"
            })) : await navigator.clipboard.writeText("");
        } catch (e) {
            console.error("[SW] Clipboard clear failed:", e);
        }
    }
})();
