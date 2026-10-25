import '@m3e/web/theme';
import '@m3e/web/form-field';
import '@m3e/web/button';
import '@m3e/web/heading';
import '@m3e/web/snackbar';
import './auth.css';

import { aetlaApi, toast } from './client';
import { clearErrors, liveValidate, markSubmitAttempted, setBusy, setFieldError } from './form';

export type AuthMode = 'login' | 'register';

const ID_RE = /^[a-z0-9_]{4,16}$/;

const I = {
  logo: 'M0 207.884L43.617 207.884L48.0243 200.277L189.108 200.277L193.516 207.884L237.133 207.884L118.541 2.28223L0 207.884ZM64.691 171.42L118.592 77.9503L172.492 171.42L64.691 171.42Z',
  person:
    'M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z',
  face: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-5-7c.83 0 1.5-.67 1.5-1.5S7.83 10 7 10s-1.5.67-1.5 1.5S6.17 13 7 13zm10 0c.83 0 1.5-.67 1.5-1.5S17.83 10 17 10s-1.5.67-1.5 1.5.67 1.5 1.5 1.5zm-5 5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z',
  lock: 'M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.76 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z',
  eye: 'M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z',
  eyeOff:
    'M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z',
  arrow: 'M8.59 16.59 13.17 12 8.59 7.41 10 6l6 6-6 6z',
};

const icon = (d: string, cls = ''): string =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;

const eyeBtn = `<button slot="suffix" type="button" class="auth-eye" aria-label="显示或隐藏密码" tabindex="-1">${icon(I.eyeOff)}${icon(I.eye)}</button>`;

function lockScroll(): void {
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  const stop = (e: Event): void => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  window.addEventListener('wheel', stop, { capture: true, passive: false });
  window.addEventListener('touchmove', stop, { capture: true, passive: false });
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const keys = [' ', 'PageDown', 'PageUp', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
      if (keys.includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
}

export function mountAuthOverlay(mode: AuthMode): void {
  document.title = mode === 'login' ? 'Aetla 账号登录' : 'Aetla 账号注册';
  document.body.dataset.auth = mode;
  lockScroll();

  const isLogin = mode === 'login';
  const host = document.createElement('div');
  host.innerHTML = `
  <m3e-theme color="#6750A4" scheme="auto">
    <div class="auth-overlay">
      <main class="auth-panel">
        <div class="auth-card">
          <div class="auth-header">
            <div class="auth-title-row">
              <svg class="auth-logo-icon" viewBox="0 0 237 209" fill="currentColor" aria-hidden="true"><path d="${I.logo}" /></svg>
              <m3e-heading variant="headline" size="medium" level="1">${isLogin ? '登录账号' : '创建账号'}</m3e-heading>
            </div>
            <p class="auth-subtitle">${isLogin ? '登录你的 Aetla 账号' : '注册你的 Aetla 账号'}</p>
          </div>
          <div class="auth-content">
            <m3e-form-field id="ff-id">
              <label slot="label" for="id">账号ID</label>
              <span slot="prefix" class="auth-prefix">${icon(I.person)}</span>
              <input id="id" name="id" autocomplete="username" maxlength="16" />
              <span slot="hint">数字、小写字母或下划线</span>
              <span slot="error"></span>
            </m3e-form-field>
            ${
              isLogin
                ? ''
                : `<m3e-form-field id="ff-username">
              <label slot="label" for="username">昵称</label>
              <span slot="prefix" class="auth-prefix">${icon(I.face)}</span>
              <input id="username" name="username" maxlength="32" />
              <span slot="error"></span>
            </m3e-form-field>`
            }
            <m3e-form-field id="ff-password">
              <label slot="label" for="password">密码</label>
              <span slot="prefix" class="auth-prefix">${icon(I.lock)}</span>
              <input id="password" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" maxlength="72" />
              ${eyeBtn}
              <span slot="error"></span>
            </m3e-form-field>
            ${
              isLogin
                ? ''
                : `<m3e-form-field id="ff-password2">
              <label slot="label" for="password2">确认密码</label>
              <span slot="prefix" class="auth-prefix">${icon(I.lock)}</span>
              <input id="password2" name="password2" type="password" autocomplete="new-password" maxlength="72" />
              ${eyeBtn}
              <span slot="error"></span>
            </m3e-form-field>`
            }
          </div>
          <div class="auth-actions">
            <m3e-button variant="filled" class="auth-submit" id="submit">${isLogin ? '登录' : '注册'}</m3e-button>
            <div class="auth-footer">
              ${isLogin ? `还没有账号？<a href="/register" id="goto-register">注册${icon(I.arrow, 'auth-arrow')}</a>` : `已有账号？<a href="/login" id="goto-login">登录${icon(I.arrow, 'auth-arrow')}</a>`}
            </div>
          </div>
        </div>
      </main>
    </div>
  </m3e-theme>`;
  const root = host.firstElementChild;
  if (root) document.body.appendChild(root);

  const submitBtn = document.getElementById('submit');
  const idInput = document.getElementById('id') as HTMLInputElement | null;
  const nameInput = document.getElementById('username') as HTMLInputElement | null;
  const pwdInput = document.getElementById('password') as HTMLInputElement | null;
  const pwd2Input = document.getElementById('password2') as HTMLInputElement | null;
  if (!idInput || !pwdInput || (!isLogin && (!nameInput || !pwd2Input))) return;

  let submitting = false;

  const checkId = (v: string): string => {
    if (!v.trim()) return '账号ID不能为空';
    if (!ID_RE.test(v.trim())) return '4-16位数字、小写字母或下划线';
    return '';
  };
  const checkName = (v: string): string => {
    const len = [...v.trim()].length;
    if (len < 1) return '昵称不能为空';
    if (len > 32) return '昵称不能超过32个字符';
    return '';
  };
  const checkPwd = (v: string): string => {
    if (!v) return '密码不能为空';
    if (v.length < 6) return '密码不能少于6个字符';
    if (v.length > 72) return '密码不能超过72个字符';
    return '';
  };
  const checkPwd2 = (v: string): string => {
    if (!v) return '请再次输入密码';
    return v === pwdInput.value ? '' : '两次输入的密码不一致';
  };

  const fieldIds = isLogin ? ['ff-id', 'ff-password'] : ['ff-id', 'ff-username', 'ff-password', 'ff-password2'];

  function validateAll(): boolean {
    clearErrors(...fieldIds);
    let valid = true;
    const fail = (field: string, msg: string) => {
      setFieldError(field, msg);
      valid = false;
    };
    const idErr = checkId(idInput.value);
    if (idErr) fail('ff-id', idErr);
    if (!isLogin) {
      const nameErr = checkName(nameInput!.value);
      if (nameErr) fail('ff-username', nameErr);
    }
    const pwdErr = checkPwd(pwdInput.value);
    if (pwdErr) fail('ff-password', pwdErr);
    if (!isLogin) {
      const pwd2Err = checkPwd2(pwd2Input!.value);
      if (pwd2Err) fail('ff-password2', pwd2Err);
    }
    return valid;
  }

  async function onSubmit(): Promise<void> {
    markSubmitAttempted();
    if (!validateAll() || submitting) return;

    submitting = true;
    setBusy(submitBtn, true);
    try {
      if (isLogin) {
        const r = await aetlaApi<{ username?: string; id: string }>('/login', {
          id: idInput.value.trim(),
          password: pwdInput.value,
        });
        toast(`欢迎回来，${r.username || r.id}`);
      } else {
        await aetlaApi('/register', {
          id: idInput.value.trim(),
          username: nameInput!.value.trim(),
          password: pwdInput.value,
        });
        toast('注册成功，已自动登录');
      }
      setTimeout(() => (location.href = '/'), 600);
    } catch (e) {
      const err = e as { error?: string; message?: string };
      if (err.error === 'bad_credentials') setFieldError('ff-password', err.message ?? '账号ID或密码错误');
      if (err.error === 'id_taken') setFieldError('ff-id', err.message ?? '该账号ID已被注册');
      toast(err.message ?? (isLogin ? '登录失败，请稍后重试' : '注册失败，请稍后重试'), true);
    } finally {
      submitting = false;
      setBusy(submitBtn, false);
    }
  }

  liveValidate(idInput, 'ff-id', checkId);
  liveValidate(pwdInput, 'ff-password', checkPwd);
  if (!isLogin) {
    liveValidate(nameInput!, 'ff-username', checkName);
    liveValidate(pwd2Input!, 'ff-password2', checkPwd2);
    pwdInput.addEventListener('input', () => {
      if (pwd2Input!.value !== '') {
        setFieldError('ff-password2', checkPwd2(pwd2Input!.value));
      }
    });
  }

  document.querySelectorAll<HTMLButtonElement>('.auth-eye').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const input = btn.closest('m3e-form-field')?.querySelector<HTMLInputElement>('input');
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.toggleAttribute('data-on', show);
      input.focus();
    });
  });

  document.addEventListener('click', (e) => {
    const el = e.target as Element | null;
    if (el?.closest('#submit')) void onSubmit();
  });
  document.addEventListener('pointerdown', (e) => {
    const el = e.target as Element | null;
    if (el?.closest('#submit')) void onSubmit();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !submitting && (e.target as Element | null)?.closest?.('.auth-panel')) void onSubmit();
  });

  const reveal = (): void => {
    document.body.dataset.authReady = 'true';
  };
  if (document.body.dataset.introDone === 'true') reveal();
  else window.addEventListener('aetla:intro-done', reveal, { once: true });
}
