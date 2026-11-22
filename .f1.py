import io

p = 'index.html'
s = io.open(p, encoding='utf-8').read()

def rep(old, new):
    global s
    assert old in s, 'INTROUVABLE: ' + old[:70]
    assert s.count(old) == 1, 'NON UNIQUE: ' + old[:70]
    s = s.replace(old, new, 1)

rep('''        <option value="Mairie">Mairie</option>
        <option value="Particulier">Particuliers</option>
      </select>
      <button id="btn-add" class="btn" title="Ajouter un arbre">＋ Point</button>''',
    '''        <option value="Mairie">Mairie</option>
        <option value="Particulier">Particuliers</option>
      </select>
      <button id="btn-filter-open" class="btn" title="Afficher uniquement les arbres dont le ramassage est prévu (ou jamais réalisé)">🚚 À ramasser</button>
      <button id="btn-add" class="btn" title="Ajouter un arbre">＋ Point</button>''')

rep("""    function visibleFeatures() {
      const q = document.getElementById('search').value.trim().toLowerCase();
      const sp = document.getElementById('filter-species').value;
      const ow = document.getElementById('filter-owner').value;""",
    """    function visibleFeatures() {
      const q = document.getElementById('search').value.trim().toLowerCase();
      const sp = document.getElementById('filter-species').value;
      const ow = document.getElementById('filter-owner').value;
      const op = document.getElementById('btn-filter-open').classList.contains('active');
      const now = new Date();""")

rep("""        if (sp && (p.espece || '') !== sp) return false;
        if (ow && (OWNER_LABELS[p.type] || p.type || '') !== ow) return false;""",
    """        if (sp && (p.espece || '') !== sp) return false;
        if (ow && (OWNER_LABELS[p.type] || p.type || '') !== ow) return false;
        if (op) {
          if (p.statut === 'attente') return false;
          if (p.ramassage && new Date(p.ramassage) < now) return false;
        }""")

rep("    document.getElementById('filter-owner').addEventListener('change', render);",
    """    document.getElementById('filter-owner').addEventListener('change', render);
    document.getElementById('btn-filter-open').addEventListener('click', () => {
      document.getElementById('btn-filter-open').classList.toggle('active');
      render();
    });""")

io.open(p, 'w', encoding='utf-8').write(s)
print('#1 ok')
EOF
python3 /tmp/m1.py && rm /tmp/m1.py