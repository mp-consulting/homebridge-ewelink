(async () => {
  'use strict';

  // Confirm theme from Homebridge settings (overrides the early OS-preference detection)
  try {
    const settings = await homebridge.getUserSettings();
    const scheme = settings.colorScheme;
    if (scheme === 'dark' || scheme === 'light') {
      document.documentElement.dataset.bsTheme = scheme;
    } else if (scheme === 'auto') {
      document.documentElement.dataset.bsTheme =
        window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
  } catch {
    // getUserSettings not available in older versions — keep the early-detected theme
  }

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

  // ── Assistant (Homebridge AI Kit) ──────────────────────────────
  // Shown only when the shared HomebridgeAiKit platform is set up and enabled.

  let assistantEnabled = false;
  let assistantAvailable = false;
  try {
    if (window.MpKit && MpKit.ai) {
      const status = await MpKit.ai.status();
      assistantAvailable = true;
      assistantEnabled = !!(status && status.enabled);
    }
  } catch {
    // Routes missing or older Homebridge UI: no Assistant
  }

  // Device facts the Assistant may see: no credentials, tokens, keys or IP addresses
  const assistantDevice = d => ({
    name: d.name,
    deviceId: d.deviceId,
    brand: d.brand,
    model: d.model,
    uiid: d.uiid,
    online: !!d.online,
    lanEnabled: !!d.lanEnabled,
    lanAddressFound: !!d.lanIp,
    rfSubdevice: !!d.isRfSubdevice,
    parentDeviceId: d.parentDeviceId,
  });

  // Plugin settings the Assistant may see (never username/password)
  const assistantContext = extra => [
    extra,
    `Connection mode: ${config.mode || 'auto'}.`,
    config.countryCode ? `Account country code: ${config.countryCode}.` : '',
    credentials.region ? `API region: ${credentials.region}.` : '',
  ].filter(Boolean).join(' ');

  // Streams an explanation of `error` into `answerEl`
  const explainWithAssistant = async (button, answerEl, { error, context, device, title }) => {
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    answerEl.classList.remove('d-none');
    const answer = MpKit.ai.renderAnswer(answerEl, { title });
    try {
      const res = await MpKit.ai.explain({ error, context, device }, { onChunk: answer.append });
      answer.done(res);
    } catch (e) {
      answer.error(e);
    } finally {
      button.disabled = false;
      button.removeAttribute('aria-busy');
    }
  };

  // Shows an error in `containerId`, with an "Explain" button when the Assistant is on
  const showProblem = (containerId, { message, context, title }) => {
    const container = $(containerId);
    container.classList.remove('d-none');
    container.innerHTML = `
      <div class="alert alert-danger mb-0">
        <div class="d-flex justify-content-between align-items-start gap-2">
          <div><i class="bi bi-exclamation-triangle me-1"></i>${escapeHtml(message)}</div>
          ${assistantEnabled ? MpKit.ai.renderButton({ label: 'Explain', size: 'sm', className: 'flex-shrink-0 js-explain' }) : ''}
        </div>
      </div>
      <div class="assistant-answer mt-2 d-none"></div>
    `;
    if (assistantEnabled) {
      const button = container.querySelector('.js-explain');
      const answerEl = container.querySelector('.assistant-answer');
      button.addEventListener('click', () => explainWithAssistant(button, answerEl, {
        error: message,
        context: assistantContext(context),
        title,
      }));
    }
  };

  const clearProblem = containerId => {
    $(containerId).classList.add('d-none');
    $(containerId).innerHTML = '';
  };

  // Why a device needs attention, or null when it looks fine
  const deviceProblem = d => {
    if (!d.online) {
      return 'The eWeLink cloud reports this device as offline.';
    }
    if (d.lanEnabled && !d.lanIp) {
      return 'LAN control is enabled for this device, but it was not found on the local network (no IP address over mDNS).';
    }
    return null;
  };

  if (assistantAvailable && !assistantEnabled) {
    $('assistant-hint').classList.remove('d-none');
  }

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
    list.innerHTML = devices.map((d, index) => {
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
      const explainButton = assistantEnabled && deviceProblem(d)
        ? MpKit.ai.renderButton({ label: 'Explain', size: 'sm', className: 'js-explain-device', title: 'Explain this device problem' })
        : '';
      return `
        <div class="device-item ${d.isRfSubdevice ? 'rf-subdevice' : ''}" data-device-index="${index}">
          <div class="device-info">
            <div class="device-name">${escapeHtml(d.name)}</div>
            <div class="device-meta">
              <span class="font-monospace me-2">ID: ${escapeHtml(d.deviceId)}</span>
              <span>${escapeHtml(d.brand || 'Unknown')} — ${escapeHtml(d.model || 'Unknown')} (UIID: ${d.uiid ?? 'N/A'})</span>
            </div>
            ${buttonInfo}
          </div>
          <div class="d-flex align-items-center gap-2 flex-shrink-0 ms-3 mt-1">
            ${explainButton}${rfBadge}${lanBadge}${onlineBadge}
          </div>
          <div class="assistant-answer d-none"></div>
        </div>
      `;
    }).join('');
  };

  // ── Load devices ───────────────────────────────────────────────

  const loadDevices = async () => {
    $('refresh-spinner').classList.remove('d-none');
    $('btn-refresh').disabled = true;
    try {
      clearProblem('devices-problem');
      const res = await homebridge.request('/get-devices', credentials);
      if (res.success) {
        devices = res.devices;
        $('device-count').textContent = devices.length;
        renderDevices();
      } else {
        throw new Error(res.error || 'Failed to load devices');
      }
    } catch (e) {
      const message = e.message || 'Failed to load devices';
      homebridge.toast.error(message);
      showProblem('devices-problem', {
        message,
        context: 'Loading the device list from the eWeLink cloud (plus a 3 second mDNS LAN scan) failed in the plugin settings.',
        title: 'Why did loading devices fail?',
      });
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
    clearProblem('login-problem');

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
        throw new Error(res.error || 'Login failed');
      }
    } catch (e) {
      const message = e.message || 'Login failed';
      homebridge.toast.error(message);
      showProblem('login-problem', {
        message,
        context: `Logging in to the eWeLink cloud from the plugin settings failed. Selected country code: ${countryCode}.`,
        title: 'Why did the login fail?',
      });
    } finally {
      $('login-spinner').classList.add('d-none');
      $('btn-login').disabled = false;
    }
  });

  // ── Events: Devices tab ────────────────────────────────────────

  $('btn-refresh').addEventListener('click', loadDevices);

  $('device-list').addEventListener('click', e => {
    const button = e.target.closest('.js-explain-device');
    const row = button && button.closest('[data-device-index]');
    const device = row && devices[Number(row.dataset.deviceIndex)];
    if (!device) {
      return;
    }
    explainWithAssistant(button, row.querySelector('.assistant-answer'), {
      error: deviceProblem(device) || 'The device does not respond as expected.',
      context: assistantContext('The user is looking at the device list of the eWeLink plugin settings.'),
      device: assistantDevice(device),
      title: `Why does ${device.name || 'this device'} need attention?`,
    });
  });
  $('btn-save').addEventListener('click', saveConfiguration);

  // ── Events: Settings tab ───────────────────────────────────────

  $('btn-save-settings').addEventListener('click', saveConfiguration);

  // ── Assistant: describe your setup ─────────────────────────────

  if (assistantEnabled) {
    $('assistant-config-card').classList.remove('d-none');
    $('assistant-config-badge').innerHTML = MpKit.ai.renderBadge();
    $('assistant-config-action').innerHTML = MpKit.ai.renderButton({ label: 'Suggest changes', id: 'btn-assistant-config' });

    $('btn-assistant-config').addEventListener('click', async () => {
      const request = $('assistant-config-request').value.trim();
      if (!request) {
        homebridge.toast.error('Describe what you want to change first');
        return;
      }
      const button = $('btn-assistant-config');
      const result = $('assistant-config-result');
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      result.innerHTML = MpKit.ai.renderThinking('Preparing a suggestion…');
      try {
        // The eWeLink login stays in the browser: strip it before and merge it back on apply
        const { username, password, ...shareable } = config;
        const schema = await homebridge.getPluginConfigSchema();
        const res = await MpKit.ai.config({ schema, request, current: shareable });
        // Keep keys the schema does not describe (platform, _bridge, ...) and the current key order
        const known = new Set(Object.keys((schema.schema || schema).properties || {}));
        const proposed = res.config || {};
        const suggested = {};
        Object.keys(shareable).forEach(k => {
          if (!known.has(k)) {
            suggested[k] = shareable[k];
          } else if (k in proposed) {
            suggested[k] = proposed[k];
          }
        });
        Object.keys(proposed).forEach(k => {
          if (known.has(k) && !(k in suggested)) {
            suggested[k] = proposed[k];
          }
        });
        delete suggested.username;
        delete suggested.password;
        result.innerHTML = '<div class="assistant-explanation mb-2"></div><div class="assistant-diff"></div>';
        MpKit.ai.renderAnswer(result.querySelector('.assistant-explanation'), { text: res.explanation, streaming: false, title: 'Suggested change' });
        MpKit.ai.renderDiff(result.querySelector('.assistant-diff'), {
          before: shareable,
          after: suggested,
          applyLabel: 'Apply',
          onApply: async () => {
            const newConfig = { ...suggested, platform: 'eWeLink', name: suggested.name || config.name || 'eWeLink' };
            if (username !== undefined) {
              newConfig.username = username;
            }
            if (password !== undefined) {
              newConfig.password = password;
            }
            await homebridge.updatePluginConfig([newConfig]);
            Object.keys(config).forEach(k => delete config[k]);
            Object.assign(config, newConfig);
            prefillSettingsTab();
            homebridge.toast.success('Change applied. Click Save Configuration to keep it.');
          },
        });
      } catch (e) {
        result.innerHTML = '';
        MpKit.ai.renderAnswer(result, { streaming: false }).error(e);
      } finally {
        button.disabled = false;
        button.removeAttribute('aria-busy');
      }
    });
  }

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
