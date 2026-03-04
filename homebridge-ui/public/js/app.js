(async () => {
  'use strict';

  // State
  let credentials = { accessToken: null, region: null, apiKey: null };
  let devices = [];

  // DOM helper
  const $ = id => document.getElementById(id);
  const steps = { login: $('step-login'), devices: $('step-devices'), complete: $('step-complete') };

  // Load existing config
  const pluginConfig = await homebridge.getPluginConfig();
  const config = pluginConfig[0] || {};

  // Escape HTML for XSS prevention
  const escapeHtml = text => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Show/hide step
  const showStep = step => {
    Object.entries(steps).forEach(([k, el]) => {
      el.classList.toggle('d-none', k !== step);
    });
  };

  // Pre-fill login form from config
  if (config.username) {
    $('username').value = config.username;
  }
  if (config.password) {
    $('password').value = config.password;
  }
  if (config.countryCode) {
    $('countryCode').value = config.countryCode;
  }

  // Pre-fill Settings tab from config
  const prefillSettingsTab = () => {
    $('settings-mode').value = config.mode || 'auto';
    $('settings-debug').checked = !!config.debug;
    $('settings-offline-as-off').checked = !!config.offlineAsOff;
  };
  prefillSettingsTab();

  // ── Device list ────────────────────────────────────────────────

  const renderDevices = () => {
    const list = $('device-list');
    if (!devices.length) {
      list.innerHTML = MpKit.EmptyState.render({
        iconClass: 'bi bi-plug',
        title: 'No devices found',
        hint: 'Connect your eWeLink account and click Refresh',
      });
      return;
    }
    list.innerHTML = devices.map(d => {
      const onlineBadge = d.online ? MpKit.StatusBadge.online() : MpKit.StatusBadge.offline();
      const lanBadge = d.lanEnabled && d.lanIp
        ? `<span class="badge badge-lan ms-1">LAN: ${escapeHtml(d.lanIp)}</span>`
        : d.lanEnabled
          ? '<span class="badge badge-lan-warn ms-1">LAN: No IP</span>'
          : '<span class="badge bg-secondary ms-1">Cloud</span>';
      const rfBadge = d.isRfSubdevice ? '<span class="badge badge-rf ms-1">RF</span>' : '';
      const buttonInfo = d.buttons && d.buttons.length > 0
        ? `<div class="device-buttons mt-1">
            ${d.buttons.map(b => `<span class="button-name">${escapeHtml(b)}</span>`).join(' ')}
           </div>`
        : '';
      return `
        <div class="device-item ${d.isRfSubdevice ? 'rf-subdevice' : ''}">
          <div class="device-info">
            <div class="device-name">${escapeHtml(d.name)}</div>
            <div class="device-meta">
              <span class="font-monospace me-2">ID: ${escapeHtml(d.deviceId)}</span>
              <span>${escapeHtml(d.brand || 'Unknown')} — ${escapeHtml(d.model || 'Unknown')} (UIID: ${d.uiid ?? 'N/A'})</span>
            </div>
            ${buttonInfo}
          </div>
          <div class="d-flex align-items-center gap-2 flex-shrink-0 ms-3 mt-1">
            ${rfBadge}${lanBadge}${onlineBadge}
          </div>
        </div>
      `;
    }).join('');
  };

  // ── Load devices ───────────────────────────────────────────────

  const loadDevices = async () => {
    $('refresh-spinner').classList.remove('d-none');
    $('btn-refresh').disabled = true;
    try {
      const res = await homebridge.request('/get-devices', credentials);
      if (res.success) {
        devices = res.devices;
        $('device-count').textContent = devices.length;
        renderDevices();
      } else {
        homebridge.toast.error(res.error || 'Failed to load devices');
      }
    } catch (e) {
      homebridge.toast.error(e.message || 'Failed to load devices');
    } finally {
      $('refresh-spinner').classList.add('d-none');
      $('btn-refresh').disabled = false;
    }
  };

  // ── Session check ──────────────────────────────────────────────

  const checkSession = async () => {
    try {
      const res = await homebridge.request('/get-tokens');
      if (res.success) {
        credentials = { accessToken: res.accessToken, region: res.region, apiKey: res.apiKey };
        $('active-session-notice').classList.remove('d-none');
        $('login-form').classList.add('d-none');
        $('session-loading').classList.remove('d-none');
        await loadDevices();
        $('session-loading').classList.add('d-none');
        showStep('devices');
        return true;
      }
    } catch {
      // No session, show login
    }
    return false;
  };

  // ── Save configuration ─────────────────────────────────────────

  const saveConfiguration = async () => {
    homebridge.showSpinner();
    try {
      const newConfig = {
        ...config,
        platform: 'eWeLink',
        name: config.name || 'eWeLink',
        mode: $('settings-mode').value,
        debug: $('settings-debug').checked || undefined,
        offlineAsOff: $('settings-offline-as-off').checked || undefined,
      };
      await homebridge.updatePluginConfig([newConfig]);
      await homebridge.savePluginConfig();
      Object.assign(config, newConfig);
      homebridge.toast.success('Configuration saved!');
      showStep('complete');
    } catch (e) {
      homebridge.toast.error(e.message || 'Failed to save configuration');
    } finally {
      homebridge.hideSpinner();
    }
  };

  // ── Initialize ─────────────────────────────────────────────────

  await checkSession();

  // ── Events: Login ──────────────────────────────────────────────

  $('btn-new-login').addEventListener('click', () => {
    $('active-session-notice').classList.add('d-none');
    $('login-form').classList.remove('d-none');
  });

  $('btn-login').addEventListener('click', async () => {
    const username = $('username').value.trim();
    const password = $('password').value;
    const countryCode = $('countryCode').value;

    if (!username || !password) {
      homebridge.toast.error('Please enter your username and password');
      return;
    }

    $('login-spinner').classList.remove('d-none');
    $('btn-login').disabled = true;

    try {
      const res = await homebridge.request('/login', { username, password, countryCode });
      if (res.success) {
        credentials = { accessToken: res.accessToken, region: res.region, apiKey: res.apiKey };
        const newConfig = {
          ...config,
          platform: 'eWeLink',
          name: config.name || 'eWeLink',
          username,
          password,
          countryCode,
        };
        await homebridge.updatePluginConfig([newConfig]);
        Object.assign(config, newConfig);
        prefillSettingsTab();
        homebridge.toast.success('Successfully connected to eWeLink!');
        await loadDevices();
        showStep('devices');
      } else {
        homebridge.toast.error(res.error || 'Login failed');
      }
    } catch (e) {
      homebridge.toast.error(e.message || 'Login failed');
    } finally {
      $('login-spinner').classList.add('d-none');
      $('btn-login').disabled = false;
    }
  });

  // ── Events: Devices tab ────────────────────────────────────────

  $('btn-refresh').addEventListener('click', loadDevices);
  $('btn-save').addEventListener('click', saveConfiguration);

  // ── Events: Settings tab ───────────────────────────────────────

  $('btn-save-settings').addEventListener('click', saveConfiguration);

  // ── Events: Restart ────────────────────────────────────────────

  const attachRestartHandler = () => {
    $('btn-restart').addEventListener('click', () => {
      const container = $('restart-btn-container');
      container.innerHTML = `
        <span class="small text-body-secondary me-2">Restart Homebridge?</span>
        <button class="btn btn-warning btn-sm me-1" id="btn-restart-confirm">
          <i class="bi bi-check me-1"></i>Yes, restart
        </button>
        <button class="btn btn-outline-secondary btn-sm" id="btn-restart-cancel">Cancel</button>
      `;
      $('btn-restart-confirm').addEventListener('click', () => {
        homebridge.closeSettings();
      });
      $('btn-restart-cancel').addEventListener('click', () => {
        container.innerHTML = '<button id="btn-restart" class="btn btn-warning"><i class="bi bi-arrow-repeat me-1"></i>Restart Homebridge</button>';
        attachRestartHandler();
      });
    });
  };
  attachRestartHandler();

  // ── Schema / config changes ────────────────────────────────────

  homebridge.addEventListener('configChanged', e => {
    Object.assign(config, e.data);
    prefillSettingsTab();
  });
})();
