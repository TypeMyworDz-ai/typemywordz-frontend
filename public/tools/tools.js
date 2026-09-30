(function () {
  var BACKEND = 'https://backendforrailway-production-7128.up.railway.app';
  var form = document.getElementById('tm-tool');
  if (!form) return;
  var input = document.getElementById('tm-file');
  var drop = document.getElementById('tm-drop');
  var title = document.getElementById('tm-drop-title');
  var hint = document.getElementById('tm-drop-hint');
  var go = document.getElementById('tm-go');
  var msg = document.getElementById('tm-msg');
  var original = title.textContent;
  var file = null;

  function say(text, kind) { msg.textContent = text || ''; msg.className = 'msg' + (kind ? ' ' + kind : ''); }
  function pick(f) {
    file = f || null;
    if (file) { title.textContent = file.name; hint.textContent = (file.size / 1048576).toFixed(2) + ' MB'; }
    else { title.textContent = original; hint.textContent = 'or drop it here. Up to 15 MB.'; }
    go.disabled = !file;
    say('');
  }
  input.addEventListener('change', function () { pick(input.files && input.files[0]); });
  ['dragenter', 'dragover'].forEach(function (name) { drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (name) { drop.addEventListener(name, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) pick(e.dataTransfer.files[0]); });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!file || go.disabled) return;
    if (file.size > 15 * 1048576) { say('That file is larger than 15 MB.', 'err'); return; }
    go.disabled = true; go.textContent = 'Converting...'; say('');
    var data = new FormData();
    data.append('file', file, file.name);
    data.append('target', form.getAttribute('data-target'));
    fetch(BACKEND + '/tools/convert', { method: 'POST', body: data })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (p) { throw new Error(p.detail || 'The conversion failed. Please try a different file.'); });
        }
        var header = response.headers.get('Content-Disposition') || '';
        var m = /filename="?([^";]+)"?/i.exec(header);
        var name = m ? m[1] : 'converted';
        return response.blob().then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
          say('Done. Your file has been downloaded and we have deleted our copy.', 'ok');
        });
      })
      .catch(function (error) { say(error.message || 'The conversion failed.', 'err'); })
      .then(function () { go.textContent = 'Convert and download'; go.disabled = !file; });
  });
})();
