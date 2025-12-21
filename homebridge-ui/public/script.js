(async () => {
  try {
    const currentConfig = await homebridge.getPluginConfig();

    const showIntro = () => {
      homebridge.disableSaveButton?.();
      const introContinue = document.getElementById('introContinue');
      introContinue.addEventListener('click', () => {
        homebridge.showSpinner();
        document.getElementById('pageIntro').style.display = 'none';
        document.getElementById('menuWrapper').style.display = 'inline-flex';
        showSettings();
        homebridge.hideSpinner();
      });
      document.getElementById('pageIntro').style.display = 'block';
    };

    const showDevices = async () => {
      homebridge.showSpinner();
      homebridge.disableSaveButton?.();
      homebridge.hideSchemaForm();
      document.getElementById('menuHome').classList.remove('btn-elegant');
      document.getElementById('menuHome').classList.add('btn-primary');
      document.getElementById('menuDevices').classList.add('btn-elegant');
      document.getElementById('menuDevices').classList.remove('btn-primary');
      document.getElementById('menuSettings').classList.remove('btn-elegant');
      document.getElementById('menuSettings').classList.add('btn-primary');
      document.getElementById('pageSupport').style.display = 'none';
      document.getElementById('pageDevices').style.display = 'block';

      const cachedAccessories =
        typeof homebridge.getCachedAccessories === 'function'
          ? await homebridge.getCachedAccessories()
          : await homebridge.request('/getCachedAccessories');

      if (cachedAccessories.length > 0) {
        cachedAccessories.sort((a, b) => {
          const nameA = a.displayName.toLowerCase();
          const nameB = b.displayName.toLowerCase();
          if (nameA > nameB) return 1;
          if (nameB > nameA) return -1;
          return 0;
        });
      }

      const deviceSelect = document.getElementById('deviceSelect');
      deviceSelect.innerHTML = '';

      cachedAccessories.forEach((a) => {
        const option = document.createElement('option');
        option.text = a.displayName;
        option.value = a.context.hbDeviceId;
        deviceSelect.add(option);
      });

      const showDeviceInfo = async (hbDeviceId) => {
        homebridge.showSpinner();
        const thisAcc = cachedAccessories.find((x) => x.context.hbDeviceId === hbDeviceId);
        const context = thisAcc.context;

        document.getElementById('displayName').innerHTML = thisAcc.displayName;
        document.getElementById('reachableWAN').innerHTML = context.reachableWAN
          ? '<i class="fas fa-circle mr-1 green-text"></i> Online'
          : '<i class="fas fa-circle mr-1 red-text"></i> Offline';
        document.getElementById('reachableLAN').innerHTML = context.reachableLAN
          ? '<i class="fas fa-circle mr-1 green-text"></i> Online'
          : '<i class="fas fa-circle mr-1 red-text"></i> Offline';
        document.getElementById('lanIP').innerHTML = context.ip || 'N/A';
        document.getElementById('hbDeviceId').innerHTML = context.hbDeviceId || 'N/A';
        document.getElementById('eweDeviceId').innerHTML = context.eweDeviceId || 'N/A';
        document.getElementById('eweBrandName').innerHTML = context.eweBrandName || 'N/A';
        document.getElementById('eweFirmware').innerHTML = context.firmware || 'N/A';
        document.getElementById('eweMacAddress').innerHTML = context.macAddress || 'N/A';
        document.getElementById('eweModel').innerHTML =
          (context.eweModel || 'N/A') + ' (' + (context.eweUIID || 'N/A') + ')';
        document.getElementById('eweShared').innerHTML = context.eweShared
          ? 'Yes (by ' + context.eweShared + ')'
          : 'No';
        document.getElementById('imgIcon').innerHTML = context.eweBrandLogo
          ? '<img src="' + context.eweBrandLogo + '" style="width: 150px;">'
          : '';
        document.getElementById('deviceTable').style.display = 'inline-table';

        homebridge.hideSpinner();
      };

      deviceSelect.addEventListener('change', (event) => showDeviceInfo(event.target.value));

      if (cachedAccessories.length > 0) {
        showDeviceInfo(cachedAccessories[0].context.hbDeviceId);
      } else {
        const option = document.createElement('option');
        option.text = 'No Devices';
        deviceSelect.add(option);
        deviceSelect.disabled = true;
      }

      homebridge.hideSpinner();
    };

    const showSupport = () => {
      homebridge.showSpinner();
      homebridge.disableSaveButton?.();
      homebridge.hideSchemaForm();
      document.getElementById('menuHome').classList.add('btn-elegant');
      document.getElementById('menuHome').classList.remove('btn-primary');
      document.getElementById('menuDevices').classList.remove('btn-elegant');
      document.getElementById('menuDevices').classList.add('btn-primary');
      document.getElementById('menuSettings').classList.remove('btn-elegant');
      document.getElementById('menuSettings').classList.add('btn-primary');
      document.getElementById('pageSupport').style.display = 'block';
      document.getElementById('pageDevices').style.display = 'none';
      homebridge.hideSpinner();
    };

    const showSettings = () => {
      homebridge.showSpinner();
      homebridge.enableSaveButton?.();
      document.getElementById('menuHome').classList.remove('btn-elegant');
      document.getElementById('menuHome').classList.add('btn-primary');
      document.getElementById('menuDevices').classList.remove('btn-elegant');
      document.getElementById('menuDevices').classList.add('btn-primary');
      document.getElementById('menuSettings').classList.add('btn-elegant');
      document.getElementById('menuSettings').classList.remove('btn-primary');
      document.getElementById('pageSupport').style.display = 'none';
      document.getElementById('pageDevices').style.display = 'none';
      homebridge.showSchemaForm();
      homebridge.hideSpinner();
    };

    const showDisabledBanner = () => {
      document.getElementById('disabledBanner').style.display = 'block';
    };

    const enablePlugin = async () => {
      homebridge.showSpinner();
      document.getElementById('disabledBanner').style.display = 'none';
      currentConfig[0].disablePlugin = false;
      await homebridge.updatePluginConfig(currentConfig);
      await homebridge.savePluginConfig();
      homebridge.hideSpinner();
    };

    document.getElementById('menuHome').addEventListener('click', () => showSupport());
    document.getElementById('menuDevices').addEventListener('click', () => showDevices());
    document.getElementById('menuSettings').addEventListener('click', () => showSettings());
    document.getElementById('disabledEnable').addEventListener('click', () => enablePlugin());

    if (currentConfig.length) {
      document.getElementById('menuWrapper').style.display = 'inline-flex';
      showSettings();
      if (currentConfig[0].disablePlugin) {
        showDisabledBanner();
      }
    } else {
      currentConfig.push({ name: 'eWeLink' });
      await homebridge.updatePluginConfig(currentConfig);
      showIntro();
    }
  } catch (err) {
    homebridge.toast.error(err.message, 'Error');
  } finally {
    homebridge.hideSpinner();
  }
})();
