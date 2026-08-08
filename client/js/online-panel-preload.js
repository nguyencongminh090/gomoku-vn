// Auto-open the online panel on desktop sidebar (>= 900px)
(function() {
  var body = document.getElementById('online-panel-body');
  var toggle = document.getElementById('online-panel-toggle');
  if (window.innerWidth >= 900 && body && toggle) {
    body.classList.add('open');
    toggle.classList.add('open');
  }
})();
