L.Control.Radar = L.Control.extend({
  NEXRAD_URL: `https://mesonet.agron.iastate.edu/cgi-bin/wms/nexrad/n0q.cgi`,
  NEXRAD_LAYER: `nexrad-n0q-900913`,

  isPaused: false,
  timeLayerIndex: 0,
  timeLayers: [],

  options: {
    position: `topright`,
    opacity: 0.575,
    zIndex: 200,
    transitionMs: 750,
    playHTML: `&#9658;`,
    pauseHTML: `&#9616;`,
    refreshTime: 5,
    start_active: false,
  },

  onRemove: function () {
    L.DomUtil.remove(this.container);
  },

  refreshTimer: function (myThis) {
    if (myThis.refresher == 0) {
      myThis.refresher = setInterval(function () {
        myThis.setDisabled(false);
        if (myThis.timeLayers.length > 0) {
          myThis.removeLayers();
        }
        myThis.timeLayers = myThis.generateLayers();
        myThis.setTransitionTimer();
        myThis.isPaused = false;
      }, myThis.options.refreshTime * 60000);
    }
  },

  onAdd: function (map) {
    this.map = map;
    // setup control container
    this.container = L.DomUtil.create(`div`, "leaflet-radar");

    L.DomEvent.disableClickPropagation(this.container);
    L.DomEvent.on(this.container, `control_container`, function (e) {
      L.DomEvent.stopPropagation(e);
    });
    L.DomEvent.disableScrollPropagation(this.container);

    // add control elements within container
    checkbox_div = L.DomUtil.create(
      `div`,
      `leaflet-radar-toggle`,
      this.container,
    );

    this.checkbox = document.createElement(`input`);
    this.checkbox.id = `leaflet-radar-toggle`;
    this.checkbox.type = `checkbox`;
    this.checkbox.checked = this.options.start_active;
    this.checkbox.onclick = () => this.toggle();

    checkbox_div.appendChild(this.checkbox);

    let checkbox_label = document.createElement(`span`);
    checkbox_label.innerText = `Radar`;

    checkbox_div.appendChild(checkbox_label);

    this.timestamp_div = L.DomUtil.create(
      `div`,
      `leaflet-radar-timestamp`,
      this.container,
    );

    this.setDisabled(this.options.start_active);
    this.isPaused = this.options.start_active;

    if (this.options.start_active) this.toggle(true);
    return this.container;
  },

  hideLayerByIndex: function (index) {
    this.timeLayers[index].tileLayer.setOpacity(0);
    this.timestamp_div.innerHTML = ``;
  },

  showLayerByIndex: function (index) {
    this.timeLayers[index].tileLayer.setOpacity(this.options.opacity);
    this.timestamp_div.innerHTML = this.timeLayers[index].timestamp;
  },

  setDisabled: function (disabled) {
    this.timestamp_div.innerText = ``;
  },

  toggle: function (first_load = false) {
    if (!first_load) window.toggleNexrad();
    if (!this.checkbox.checked) {
      this.setDisabled(true);
      this.removeLayers();
      this.refresher = undefined;
      return;
    }

    this.setDisabled(false);

    this.timeLayers = this.generateLayers();
    this.addLayers(this.timeLayers);

    this.timeLayerIndex = 0;

    this.isPaused = false;

    this.refresher = 0;
    this.refreshTimer(this);
    this.setTransitionTimer();
  },

  setTransitionTimer: function () {
    if (this.isPaused) {
      return;
    }

    this.timeLayers.forEach((timeLayer) => {
      timeLayer.tileLayer.setOpacity(0);
      timeLayer.tileLayer.addTo(this.map);
    });

    if (this.checkbox.checked) {
      this.showLayerByIndex(this.timeLayerIndex);
    }
  },

  incrementLayerIndex: function () {
    this.timeLayerIndex++;
    if (this.timeLayerIndex > this.timeLayers.length - 1) {
      this.timeLayerIndex = 0;
    }
  },

  addLayers: function () {
    this.timeLayers.forEach((timeLayer) => {
      timeLayer.tileLayer.setOpacity(0);
      timeLayer.tileLayer.addTo(this.map);
    });
  },

  removeLayers: function () {
    this.timeLayers.forEach((timeLayer) =>
      timeLayer.tileLayer.removeFrom(this.map),
    );
    this.timeLayers = [];
    this.timeLayerIndex = 0;
  },

  generateLayers: function () {
    let timeLayers = [];

    const TOTAL_INTERVALS = 0;
    const INTERVAL_LENGTH_HRS = 0;

    const currentTime = new Date();

    for (let i = 0; i <= TOTAL_INTERVALS; i++) {
      const timeDiffMins =
        TOTAL_INTERVALS * INTERVAL_LENGTH_HRS - INTERVAL_LENGTH_HRS * i;

      const suffix = (function (time) {
        switch (time) {
          case 0:
            return "";
          case 5:
            return "-m05m";
          default:
            return "-m" + time + "m";
        }
      })(timeDiffMins);

      const layerRequest = this.NEXRAD_LAYER + suffix;

      const layer = L.tileLayer.wms(this.NEXRAD_URL, {
        layers: layerRequest,
        format: `image/png`,
        transparent: true,
        opacity: this.options.opacity,
        zIndex: this.options.zIndex,
      });

      const timeString = new Date(
        currentTime.valueOf() - timeDiffMins * 60 * 1000,
      ).toLocaleTimeString();
      timeLayers.push({
        timestamp: `${timeString}`,
        tileLayer: layer,
      });
    }
    return timeLayers;
  },
});

L.control.radar = function (options) {
  return new L.Control.Radar(options);
};
