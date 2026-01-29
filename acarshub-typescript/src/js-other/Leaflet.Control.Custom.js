(function (window, document, undefined) {
  L.Control.Custom = L.Control.extend({
    version: "1.0.1",
    options: {
      position: "topright",
      id: "",
      title: "",
      classes: "",
      content: "",
      style: {},
      data: {},
      events: {},
    },
    container: null,
    onAdd: function (map) {
      this.container = L.DomUtil.create("div");
      this.container.id = this.options.id;
      this.container.title = this.options.title;
      this.container.className = this.options.classes;
      this.container.innerHTML = this.options.content;

      for (var option in this.options.style) {
        this.container.style[option] = this.options.style[option];
      }

      for (var data in this.options.data) {
        this.container.dataset[data] = this.options.data[data];
      }

      /* Prevent click events propagation to map */
      L.DomEvent.disableClickPropagation(this.container);

      /* Prevent right click event propagation to map */
      L.DomEvent.on(this.container, "contextmenu", function (ev) {
        L.DomEvent.stopPropagation(ev);
      });

      /* Prevent scroll events propagation to map when cursor on the div */
      L.DomEvent.disableScrollPropagation(this.container);

      for (var event in this.options.events) {
        L.DomEvent.on(
          this.container,
          event,
          this.options.events[event],
          this.container,
        );
      }

      return this.container;
    },

    onRemove: function (map) {
      for (var event in this.options.events) {
        L.DomEvent.off(
          this.container,
          event,
          this.options.events[event],
          this.container,
        );
      }
    },
  });

  L.control.custom = function (options) {
    return new L.Control.Custom(options);
  };
})(window, document);
