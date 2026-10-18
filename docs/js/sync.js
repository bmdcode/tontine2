/* =====================================================================
 *  TONTINE 2.0 — sync.js
 *  Synchronisation en ligne entre appareils et responsables (Firebase).
 *  - Chaque enregistrement (membre, groupe, part, cotisation, remise…)
 *    est un document séparé : deux saisies différentes se complètent.
 *  - Hors ligne, les saisies attendent dans l'appareil et partent dès
 *    le retour du réseau (cache Firestore).
 *  - Chaque document garde l'adresse du responsable qui l'a modifié.
 * ===================================================================== */
(function (global) {
  'use strict';

  var CFG = global.FIREBASE_CONFIG;
  var TABLES = ['membres', 'groupes', 'parts', 'versements', 'permutations', 'remises', 'observations'];
  var ESPACE = 'tontines/principale';
  var CLE_LOCAL_SEUL = 'tontine2.sans_synchro';

  var db = null, auth = null, user = null, ecoutes = [];
  var connu = {};          // { table: { id: json } } : dernier état identique au serveur
  var envois = 0, enLigne = navigator.onLine, pret = false, erreur = null;

  function app() { return global.TontineApp; }
  function e(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }

  /* ---------- démarrage ---------- */
  function init() {
    if (!CFG || !global.firebase) { majBadge(); return; }
    firebase.initializeApp(CFG);
    auth = firebase.auth();
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(function () { /* autre onglet ou navigateur ancien : continue sans cache */ });
    window.addEventListener('online', function () { enLigne = true; majBadge(); });
    window.addEventListener('offline', function () { enLigne = false; majBadge(); });
    auth.onAuthStateChanged(function (u) {
      user = u;
      if (u) demarrer(); else { arreter(); if (!localStorage.getItem(CLE_LOCAL_SEUL)) afficherConnexion(); }
      majBadge();
      if (app()) app().rendre();
    });
  }

  function col(t) { return db.collection(ESPACE + '/' + t); }
  function meta() { return db.doc(ESPACE + '/meta/parametres'); }
  function cle(id) { return String(id); }

  /** Premier branchement : récupère tout, puis écoute les changements */
  function demarrer() {
    TontineCore.Tontine.idsUniques = true;
    pret = false; erreur = null;
    Promise.all(TABLES.map(function (t) { return col(t).get(); }).concat([meta().get()])).then(function (res) {
      var distant = { tables: {}, meta: res[TABLES.length] };
      var vide = !res[TABLES.length].exists;
      TABLES.forEach(function (t, i) {
        distant.tables[t] = res[i].docs.map(function (d) { return JSON.parse(d.data().j); });
        if (res[i].size) vide = false;
      });
      var local = app().donnees();
      var localPlein = local.membres.length || local.groupes.length;
      if (vide) {
        connu = {}; TABLES.forEach(function (t) { connu[t] = {}; });
        connu.meta = null;
        pousser(local);                                     // première fois : on envoie les données de cet appareil
        if (localPlein) app().toast('Données de cet appareil envoyées en ligne.', 'succes');
      } else {
        if (localPlein && !confirm('Des données existent déjà en ligne.\n\nElles vont remplacer celles de cet appareil (une copie de sécurité est faite). Continuer ?')) {
          auth.signOut(); return;
        }
        var d = JSON.parse(JSON.stringify(local));
        TABLES.forEach(function (t) { d[t] = distant.tables[t]; });
        if (distant.meta.exists) { var m = JSON.parse(distant.meta.data().j); d.parametres = m.parametres; d.seq = m.seq; d.version = m.version || d.version; }
        TABLES.forEach(function (t) { d.seq[t] = Math.max(d.seq[t] || 0, d[t].reduce(function (x, r) { return Math.max(x, r.id); }, 0)); });
        memoriser(d);
        app().recues(d, true);
      }
      ecouter();
      pret = true; majBadge();
    }).catch(function (err) { erreur = err.message; majBadge(); console.error(err); app().toast('Synchronisation impossible : ' + err.message, 'erreur'); });
  }

  function memoriser(d) {
    connu = {};
    TABLES.forEach(function (t) { connu[t] = {}; d[t].forEach(function (r) { connu[t][cle(r.id)] = JSON.stringify(r); }); });
    connu.meta = JSON.stringify({ parametres: d.parametres, seq: d.seq, version: d.version });
  }

  /** Changements faits par les autres appareils */
  function ecouter() {
    arreterEcoutes();
    TABLES.forEach(function (t) {
      ecoutes.push(col(t).onSnapshot(function (snap) {
        var d = app().donnees(), change = false;
        snap.docChanges().forEach(function (c) {
          var id = c.doc.id, i = d[t].findIndex(function (r) { return cle(r.id) === id; });
          if (c.type === 'removed') {
            if (i >= 0) { d[t].splice(i, 1); change = true; }
            delete connu[t][id];
          } else {
            var j = c.doc.data().j;
            if (connu[t][id] === j) return;
            var r = JSON.parse(j);
            if (i >= 0) d[t][i] = r; else d[t].push(r);
            connu[t][id] = j; change = true;
            if (r.id > (d.seq[t] || 0)) d.seq[t] = r.id;
          }
        });
        if (change) { d[t].sort(function (a, b) { return a.id - b.id; }); app().recues(d, false); }
      }, function (err) { erreur = err.message; majBadge(); }));
    });
    ecoutes.push(meta().onSnapshot(function (s) {
      if (!s.exists) return;
      var j = s.data().j;
      if (j === connu.meta) return;
      var m = JSON.parse(j), d = app().donnees();
      d.parametres = m.parametres;
      Object.keys(m.seq || {}).forEach(function (k) { d.seq[k] = Math.max(d.seq[k] || 0, m.seq[k]); });
      connu.meta = j;
      app().recues(d, false);
    }));
  }

  function arreterEcoutes() { ecoutes.forEach(function (f) { f(); }); ecoutes = []; }
  function arreter() { arreterEcoutes(); pret = false; TontineCore.Tontine.idsUniques = false; }

  /** Envoie uniquement ce qui a changé depuis le dernier état connu */
  function pousser(d) {
    if (!user || !db || !connu.membres) return;
    var ops = [], par = user.email, le = firebase.firestore.FieldValue.serverTimestamp();
    TABLES.forEach(function (t) {
      var vus = {};
      d[t].forEach(function (r) {
        var id = cle(r.id), j = JSON.stringify(r);
        vus[id] = true;
        if (connu[t][id] !== j) { ops.push(['set', col(t).doc(id), { j: j, par: par, le: le }]); connu[t][id] = j; }
      });
      Object.keys(connu[t]).forEach(function (id) {
        if (!vus[id]) { ops.push(['del', col(t).doc(id)]); delete connu[t][id]; }
      });
    });
    var jm = JSON.stringify({ parametres: d.parametres, seq: d.seq, version: d.version });
    if (jm !== connu.meta) { ops.push(['set', meta(), { j: jm, par: par, le: le }]); connu.meta = jm; }
    for (var i = 0; i < ops.length; i += 450) {
      var b = db.batch();
      ops.slice(i, i + 450).forEach(function (o) { if (o[0] === 'set') b.set(o[1], o[2]); else b.delete(o[1]); });
      envois++; majBadge();
      b.commit().then(function () { envois--; majBadge(); })
        .catch(function (err) { envois--; erreur = err.message; majBadge(); app().toast('Envoi refusé : ' + err.message, 'erreur'); });
    }
  }

  /* ---------- indicateur ---------- */
  function etat() {
    if (!CFG) return { t: 'Sans synchronisation', c: 'gris' };
    if (!user) return { t: 'Non connecté', c: 'gris' };
    if (erreur) return { t: '⚠ Erreur de synchronisation', c: 'rouge' };
    if (!enLigne) return { t: '📴 Hors ligne' + (envois ? ' · ' + envois + ' envoi(s) en attente' : ''), c: 'orange' };
    if (!pret) return { t: '⏳ Connexion…', c: 'orange' };
    if (envois) return { t: '⏳ Envoi…', c: 'orange' };
    return { t: '☁ Synchronisé', c: 'vert' };
  }
  function majBadge() {
    var b = document.getElementById('badge-synchro');
    if (!b) {
      var h = document.querySelector('.entete-haut .sous-titre');
      if (!h) return;
      b = document.createElement('button'); b.id = 'badge-synchro'; b.type = 'button'; b.className = 'badge-synchro';
      b.onclick = function () { location.hash = '#parametres'; };
      h.appendChild(b);
    }
    var s = etat(); b.textContent = s.t; b.dataset.couleur = s.c;
  }

  /* ---------- connexion ---------- */
  function afficherConnexion() {
    if (document.getElementById('connexion')) return;
    var o = document.createElement('div');
    o.id = 'connexion'; o.className = 'voile-connexion';
    o.innerHTML = '<form class="boite-connexion"><h2>Connexion</h2>' +
      '<p class="aide">Connectez-vous pour partager les données avec les autres responsables et vos autres appareils.</p>' +
      '<label>E-mail</label><input name="email" type="email" autocomplete="username" required>' +
      '<label>Mot de passe</label><input name="mdp" type="password" autocomplete="current-password" required>' +
      '<p class="erreur-connexion" hidden></p>' +
      '<button class="btn plein">Se connecter</button>' +
      '<button type="button" class="btn" data-x="oubli">Mot de passe oublié</button>' +
      '<button type="button" class="btn" data-x="local">Continuer sans connexion (cet appareil seulement)</button></form>';
    document.body.appendChild(o);
    var f = o.querySelector('form'), msg = o.querySelector('.erreur-connexion');
    function dire(t) { msg.textContent = t; msg.hidden = false; }
    f.onsubmit = function (ev) {
      ev.preventDefault();
      auth.signInWithEmailAndPassword(f.email.value.trim(), f.mdp.value).then(function () {
        localStorage.removeItem(CLE_LOCAL_SEUL); o.remove();
      }).catch(function (err) {
        dire(/password|credential|user-not-found/.test(err.code) ? 'E-mail ou mot de passe incorrect.' :
             err.code === 'auth/network-request-failed' ? 'Pas de connexion internet.' : err.message);
      });
    };
    o.querySelector('[data-x=oubli]').onclick = function () {
      if (!f.email.value.trim()) { dire('Écrivez d\'abord votre e-mail.'); return; }
      auth.sendPasswordResetEmail(f.email.value.trim()).then(function () { dire('E-mail de réinitialisation envoyé.'); })
        .catch(function (err) { dire(err.message); });
    };
    o.querySelector('[data-x=local]').onclick = function () { localStorage.setItem(CLE_LOCAL_SEUL, '1'); o.remove(); };
  }

  /** Carte affichée dans Paramètres */
  function carte() {
    var s = etat();
    var h = '<div style="border:1px solid #d6dfda;border-radius:10px;padding:10px 12px;margin-bottom:12px">' +
      '<p style="margin:0 0 6px"><strong>Synchronisation en ligne</strong> · <span class="badge-synchro" data-couleur="' + s.c + '">' + e(s.t) + '</span></p>';
    if (!CFG) return h + '<p class="aide">Non configurée.</p></div>';
    if (user) {
      h += '<p class="aide" style="margin:0 0 8px">Connecté : <strong>' + e(user.email) + '</strong>. Toutes les saisies sont partagées avec les autres appareils connectés ; ' +
           'sans réseau, elles partent automatiquement au retour de la connexion.</p>' +
           '<button class="btn fixe" type="button" onclick="TontineSync.deconnecter()">Se déconnecter</button>';
    } else {
      h += '<p class="aide" style="margin:0 0 8px">Cet appareil travaille seul : ses données ne sont pas visibles ailleurs.</p>' +
           '<button class="btn plein fixe" type="button" onclick="TontineSync.connexion()">Se connecter</button>';
    }
    return h + '</div>';
  }

  global.TontineSync = {
    pousser: function (d) { try { pousser(d); } catch (x) { console.error(x); } },
    carte: carte,
    connexion: function () { localStorage.removeItem(CLE_LOCAL_SEUL); afficherConnexion(); },
    deconnecter: function () {
      if (envois && !confirm(envois + ' envoi(s) pas encore arrivé(s). Se déconnecter quand même ?')) return;
      localStorage.setItem(CLE_LOCAL_SEUL, '1'); auth.signOut();
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})(this);
