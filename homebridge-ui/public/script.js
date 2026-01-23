(async () => {
  // State
  let credentials = { accessToken: null, region: null, apiKey: null };
  let devices = [];

  // DOM elements
  const $ = id => document.getElementById(id);
  const steps = { login: $('step-login'), devices: $('step-devices'), complete: $('step-complete') };

  // Load existing config
  const pluginConfig = await homebridge.getPluginConfig();
  const config = pluginConfig[0] || {};

  // Pre-fill form
  const formFields = ['username', 'password', 'countryCode', 'mode'];
  const checkFields = ['debug', 'offlineAsOff'];
  formFields.forEach((f) => {
    if (config[f]) {
      $(f).value = config[f];
    }
  });
  checkFields.forEach((f) => {
    if (config[f]) {
      $(f).checked = config[f];
    }
  });

  // Show/hide step
  const showStep = step => Object.entries(steps).forEach(([k, el]) => el.classList.toggle('hidden', k !== step));

  // Escape HTML
  const escapeHtml = text => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // Render device list
  const renderDevices = () => {
    const list = $('device-list');
    if (!devices.length) {
      list.innerHTML = '<div class="text-center text-muted py-4">No devices found</div>';
      return;
    }
    list.innerHTML = devices.map(d => {
      const lanStatus = d.lanEnabled && d.lanIp
        ? `<span class="status-badge status-lan">LAN: ${d.lanIp}</span>`
        : d.lanEnabled
          ? '<span class="status-badge status-lan-disabled">LAN: No IP</span>'
          : '<span class="status-badge status-cloud">Cloud Only</span>';
      const isSubdevice = d.isRfSubdevice;
      const subdeviceClass = isSubdevice ? 'rf-subdevice' : '';
      const subdeviceIndicator = isSubdevice ? '<span class="status-badge status-rf">RF Sub-device</span>' : '';
      const buttonInfo = d.buttons && d.buttons.length > 0
        ? `<div class="device-buttons">Buttons: ${d.buttons.map(b => `<span class="button-name">${escapeHtml(b)}</span>`).join(', ')}</div>`
        : '';
      return `
      <div class="device-item ${subdeviceClass}">
        <div class="device-info">
          <div class="device-name">${escapeHtml(d.name)}</div>
          <div class="device-id">ID: ${d.deviceId}</div>
          <div class="device-model">${d.brand || 'Unknown'} - ${d.model || 'Unknown'} (UIID: ${d.uiid || 'N/A'})</div>
          ${buttonInfo}
        </div>
        <div class="device-status">
          ${subdeviceIndicator}
          <span class="status-badge ${d.online ? 'status-online' : 'status-offline'}">${d.online ? 'Online' : 'Offline'}</span>
          ${lanStatus}
        </div>
      </div>
    `;
    }).join('');
  };

  // Load devices
  const loadDevices = async () => {
    $('refresh-spinner').classList.remove('hidden');
    $('btn-refresh').disabled = true;

    try {
      const res = await homebridge.request('/get-devices', credentials);
      if (res.success) {
        devices = res.devices;
        $('device-count').textContent = devices.length;
        renderDevices();
      }
    } catch (e) {
      homebridge.toast.error(e.message || 'Failed to load devices');
    } finally {
      $('refresh-spinner').classList.add('hidden');
      $('btn-refresh').disabled = false;
    }
  };

  // Check for existing session
  const checkSession = async () => {
    try {
      const res = await homebridge.request('/get-tokens');
      if (res.success) {
        credentials = { accessToken: res.accessToken, region: res.region, apiKey: res.apiKey };
        $('active-session-notice').classList.remove('hidden');
        $('login-form').classList.add('hidden');
        await loadDevices();
        showStep('devices');
        return true;
      }
    } catch {
      // No session, show login
    }
    return false;
  };

  await checkSession();

  // Login with different account
  $('btn-new-login')?.addEventListener('click', () => {
    $('active-session-notice').classList.add('hidden');
    $('login-form').classList.remove('hidden');
  });

  // Login
  $('btn-login').addEventListener('click', async () => {
    const username = $('username').value.trim();
    const password = $('password').value;
    const countryCode = $('countryCode').value;

    if (!username || !password) {
      homebridge.toast.error('Please enter your username and password');
      return;
    }

    $('login-spinner').classList.remove('hidden');
    $('btn-login').disabled = true;

    try {
      const res = await homebridge.request('/login', { username, password, countryCode });
      if (res.success) {
        credentials = { accessToken: res.accessToken, region: res.region, apiKey: res.apiKey };
        homebridge.toast.success('Successfully connected to eWeLink!');

        await homebridge.updatePluginConfig([{
          ...config, platform: 'eWeLink', name: config.name || 'eWeLink',
          username, password, countryCode,
        }]);

        await loadDevices();
        showStep('devices');
      }
    } catch (e) {
      homebridge.toast.error(e.message || 'Login failed');
    } finally {
      $('login-spinner').classList.add('hidden');
      $('btn-login').disabled = false;
    }
  });

  // Refresh
  $('btn-refresh').addEventListener('click', loadDevices);

  // Advanced settings
  $('btn-schema').addEventListener('click', () => homebridge.showSchemaForm());

  // Save
  $('btn-save').addEventListener('click', async () => {
    homebridge.showSpinner();
    try {
      await homebridge.updatePluginConfig([{
        ...config, platform: 'eWeLink', name: config.name || 'eWeLink',
        username: $('username').value.trim(),
        password: $('password').value,
        countryCode: $('countryCode').value,
        mode: $('mode').value,
        debug: $('debug').checked,
        offlineAsOff: $('offlineAsOff').checked,
      }]);
      await homebridge.savePluginConfig();
      homebridge.toast.success('Configuration saved!');
      showStep('complete');
    } catch (e) {
      homebridge.toast.error(e.message || 'Failed to save configuration');
    } finally {
      homebridge.hideSpinner();
    }
  });

  // Restart
  $('btn-restart').addEventListener('click', () => {
    if (confirm('Are you sure you want to restart Homebridge?')) {
      homebridge.closeSettings();
    }
  });

  // Config changes from schema form
  homebridge.addEventListener('configChanged', e => Object.assign(config, e.data));
})();
