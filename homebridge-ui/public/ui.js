(async () => {
  // State
  let credentials = {
    accessToken: null,
    region: null,
    apiKey: null,
  };
  let devices = [];

  // DOM elements
  const stepLogin = document.getElementById('step-login');
  const stepDevices = document.getElementById('step-devices');
  const stepComplete = document.getElementById('step-complete');
  const btnLogin = document.getElementById('btn-login');
  const btnSave = document.getElementById('btn-save');
  const btnRefresh = document.getElementById('btn-refresh');
  const btnSchema = document.getElementById('btn-schema');
  const btnRestart = document.getElementById('btn-restart');
  const loginSpinner = document.getElementById('login-spinner');
  const refreshSpinner = document.getElementById('refresh-spinner');
  const deviceList = document.getElementById('device-list');
  const deviceCount = document.getElementById('device-count');

  // Load existing config
  const pluginConfig = await homebridge.getPluginConfig();
  const existingConfig = pluginConfig[0] || {};

  // Pre-fill form with existing values
  if (existingConfig.username) {
    document.getElementById('username').value = existingConfig.username;
  }
  if (existingConfig.password) {
    document.getElementById('password').value = existingConfig.password;
  }
  if (existingConfig.countryCode) {
    document.getElementById('countryCode').value = existingConfig.countryCode;
  }
  if (existingConfig.mode) {
    document.getElementById('mode').value = existingConfig.mode;
  }
  if (existingConfig.debug) {
    document.getElementById('debug').checked = existingConfig.debug;
  }
  if (existingConfig.offlineAsOff) {
    document.getElementById('offlineAsOff').checked = existingConfig.offlineAsOff;
  }

  // Check for existing session from plugin
  async function checkExistingSession() {
    try {
      const response = await homebridge.request('/get-tokens');
      if (response.success) {
        credentials = {
          accessToken: response.accessToken,
          region: response.region,
          apiKey: response.apiKey,
        };

        // Show active session notice
        document.getElementById('active-session-notice').classList.remove('hidden');
        document.getElementById('login-form').classList.add('hidden');

        // Load devices and skip to devices step
        await loadDevices();
        stepLogin.classList.add('hidden');
        stepDevices.classList.remove('hidden');

        return true;
      }
    } catch (error) {
      // No session available or error, continue with normal login flow
      console.log('No existing session found, showing login form');
    }
    return false;
  }

  // Try to use existing session on page load
  await checkExistingSession();

  // Handle "Login with Different Account" button
  const btnNewLogin = document.getElementById('btn-new-login');
  if (btnNewLogin) {
    btnNewLogin.addEventListener('click', () => {
      // Hide the active session notice
      document.getElementById('active-session-notice').classList.add('hidden');
      // Show the login form
      document.getElementById('login-form').classList.remove('hidden');
    });
  }

  // Login handler
  btnLogin.addEventListener('click', async () => {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;
    const countryCode = document.getElementById('countryCode').value;

    if (!username || !password) {
      homebridge.toast.error('Please enter your username and password');
      return;
    }

    loginSpinner.classList.remove('hidden');
    btnLogin.disabled = true;

    try {
      const response = await homebridge.request('/login', {
        username,
        password,
        countryCode,
      });

      if (response.success) {
        credentials = {
          accessToken: response.accessToken,
          region: response.region,
          apiKey: response.apiKey,
        };

        homebridge.toast.success('Successfully connected to eWeLink!');

        // Update config with credentials
        await homebridge.updatePluginConfig([{
          ...existingConfig,
          platform: 'eWeLink',
          name: existingConfig.name || 'eWeLink',
          username,
          password,
          countryCode,
        }]);

        // Load devices
        await loadDevices();

        // Show devices step
        stepLogin.classList.add('hidden');
        stepDevices.classList.remove('hidden');
      }
    } catch (error) {
      homebridge.toast.error(error.message || 'Login failed');
    } finally {
      loginSpinner.classList.add('hidden');
      btnLogin.disabled = false;
    }
  });

  // Load devices
  async function loadDevices() {
    refreshSpinner.classList.remove('hidden');
    btnRefresh.disabled = true;

    try {
      const response = await homebridge.request('/get-devices', {
        accessToken: credentials.accessToken,
        region: credentials.region,
      });

      if (response.success) {
        devices = response.devices;
        deviceCount.textContent = devices.length;
        renderDevices();
      }
    } catch (error) {
      homebridge.toast.error(error.message || 'Failed to load devices');
    } finally {
      refreshSpinner.classList.add('hidden');
      btnRefresh.disabled = false;
    }
  }

  // Render device list
  function renderDevices() {
    if (devices.length === 0) {
      deviceList.innerHTML = '<div class="text-center text-muted py-4">No devices found</div>';
      return;
    }

    deviceList.innerHTML = devices.map(device => `
      <div class="device-item">
        <div class="device-info">
          <div class="device-name">${escapeHtml(device.name)}</div>
          <div class="device-id">ID: ${device.deviceId}</div>
          <div class="device-model">${device.brand || 'Unknown'} - ${device.model || 'Unknown Model'} (UIID: ${device.uiid || 'N/A'})</div>
        </div>
        <div class="device-status">
          <span class="status-badge ${device.online ? 'status-online' : 'status-offline'}">
            ${device.online ? 'Online' : 'Offline'}
          </span>
        </div>
      </div>
    `).join('');
  }

  // Escape HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Refresh devices
  btnRefresh.addEventListener('click', loadDevices);

  // Show schema form for advanced settings
  btnSchema.addEventListener('click', () => {
    homebridge.showSchemaForm();
  });

  // Save configuration
  btnSave.addEventListener('click', async () => {
    homebridge.showSpinner();

    try {
      const config = {
        ...existingConfig,
        platform: 'eWeLink',
        name: existingConfig.name || 'eWeLink',
        username: document.getElementById('username').value.trim(),
        password: document.getElementById('password').value,
        countryCode: document.getElementById('countryCode').value,
        mode: document.getElementById('mode').value,
        debug: document.getElementById('debug').checked,
        offlineAsOff: document.getElementById('offlineAsOff').checked,
      };

      await homebridge.updatePluginConfig([config]);
      await homebridge.savePluginConfig();

      homebridge.toast.success('Configuration saved!');

      // Show complete step
      stepDevices.classList.add('hidden');
      stepComplete.classList.remove('hidden');

    } catch (error) {
      homebridge.toast.error(error.message || 'Failed to save configuration');
    } finally {
      homebridge.hideSpinner();
    }
  });

  // Restart Homebridge
  btnRestart.addEventListener('click', async () => {
    if (confirm('Are you sure you want to restart Homebridge?')) {
      try {
        // This will close the settings modal
        homebridge.closeSettings();
      } catch (error) {
        // Ignore errors when closing
      }
    }
  });

  // Listen for config changes from schema form
  homebridge.addEventListener('configChanged', (event) => {
    Object.assign(existingConfig, event.data);
  });

})();
