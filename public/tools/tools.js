(function () {
  var BACKEND = 'https://backendforrailway-production-7128.up.railway.app';
  var form = document.getElementById('tm-tool');
  if (!form) return;
  var kind = form.getAttribute('data-kind') || 'convert';
  var endpoint = form.getAttribute('data-endpoint') || '/tools/convert';
  var maxMb = parseInt(form.getAttribute('data-max') || '15', 10);
  var verb = form.getAttribute('data-verb') || 'Convert and download';
  var multiple = kind === 'merge';
  var input = document.getElementById('tm-file');
  var drop = document.getElementById('tm-drop');
  var title = document.getElementById('tm-drop-title');
  var hint = document.getElementById('tm-drop-hint');
  var list = document.getElementById('tm-list');
  var go = document.getElementById('tm-go');
  var msg = document.getElementById('tm-msg');
  var original = title.textContent;
  var originalHint = hint.textContent;
  var files = [];

  function say(text, kind2) { msg.textContent = text || ''; msg.className = 'msg' + (kind2 ? ' ' + kind2 : ''); }
  function mb(n) { return (n / 1048576).toFixed(2) + ' MB'; }
  function ready() { return multiple ? files.length >= 2 : files.length === 1; }
  function render() {
    list.innerHTML = '';
    if (multiple) {
      files.forEach(function (f, i) {
        var li = document.createElement('li');
        var name = document.createElement('span'); name.textContent = (i + 1) + '. ' + f.name + ' (' + mb(f.size) + ')'; li.appendChild(name);
        [['Up', -1], ['Down', 1]].forEach(function (b) {
          var btn = document.createElement('button'); btn.type = 'button'; btn.textContent = b[0];
          btn.onclick = function () { var j = i + b[1]; if (j < 0 || j >= files.length) return; var t = files[i]; files[i] = files[j]; files[j] = t; render(); };
          li.appendChild(btn);
        });
        var rm = document.createElement('button'); rm.type = 'button'; rm.textContent = 'Remove';
        rm.onclick = function () { files.splice(i, 1); render(); }; li.appendChild(rm);
        list.appendChild(li);
      });
      title.textContent = files.length ? 'Add more files' : original;
      hint.textContent = files.length < 2 ? 'Add at least two files.' : originalHint;
    } else if (files[0]) {
      title.textContent = files[0].name; hint.textContent = mb(files[0].size);
    } else { title.textContent = original; hint.textContent = originalHint; }
    go.disabled = !ready();
  }
  function add(picked) {
    var arr = Array.prototype.slice.call(picked || []);
    if (!arr.length) return;
    files = multiple ? files.concat(arr).slice(0, 12) : [arr[0]];
    say(''); render();
  }
  input.addEventListener('change', function () { add(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { if (e.dataTransfer && e.dataTransfer.files.length) add(e.dataTransfer.files); });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!ready() || go.disabled) return;
    for (var i = 0; i < files.length; i++) {
      if (files[i].size > maxMb * 1048576) { say(files[i].name + ' is larger than ' + maxMb + ' MB.', 'err'); return; }
    }
    go.disabled = true; go.textContent = 'Working...'; say('');
    var data = new FormData();
    if (multiple) files.forEach(function (f) { data.append('files', f, f.name); });
    else data.append('file', files[0], files[0].name);
    var t = form.getAttribute('data-target'); if (t) data.append('target', t);
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'file' || el.type === 'submit' || el.type === 'button') return;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
      data.append(el.name, el.value);
    });
    fetch(BACKEND + endpoint, { method: 'POST', body: data })
      .then(function (response) {
        if (!response.ok) {
          return response.json().catch(function () { return {}; }).then(function (p) { throw new Error(p.detail || 'That did not work. Please try a different file.'); });
        }
        var header = response.headers.get('Content-Disposition') || '';
        var m = /filename="?([^";]+)"?/i.exec(header);
        var name = m ? m[1] : 'result';
        var before = parseInt(response.headers.get('X-Original-Size') || '0', 10);
        var after = parseInt(response.headers.get('X-Result-Size') || '0', 10);
        return response.blob().then(function (blob) {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
          var extra = '';
          if (before && after) {
            extra = after < before ? ' It went from ' + mb(before) + ' to ' + mb(after) + ' (' + Math.round((1 - after / before) * 100) + '% smaller).' : ' This file could not be made smaller, so you have the original.';
          }
          say('Done. Your file has been downloaded and we have deleted our copy.' + extra, 'ok');
        });
      })
      .catch(function (error) { say(error.message || 'That did not work.', 'err'); })
      .then(function () { go.textContent = verb; go.disabled = !ready(); });
  });
})();
