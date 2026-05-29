/**
 * Morgan CRM — Gmail Add-on
 * Source-of-truth file. Paste this into a new Apps Script project
 * along with appsscript.json. See gmail-addon/README.md (paste-and-
 * deploy instructions) for the full setup walkthrough.
 *
 * Architecture:
 *   - User opens an email in Gmail → Google fires onGmailMessage
 *   - We read the sender from the open message (metadata scope only,
 *     no body access — sender is in the From header)
 *   - If the add-on isn't connected to Morgan yet, show "Connect"
 *     card with device-flow OAuth
 *   - If connected, GET /api/addon/contacts?email=<sender> →
 *       found → show match card
 *       not found → show "Add to CRM" card with editable fields,
 *         "Enrich via RocketReach" button, and project picker
 *
 * Auth storage: refresh_token in UserProperties (per-user, per-script).
 *   short-lived access_token cached in CacheService for up to 50 min.
 */

const MORGAN_BASE = 'https://morgan.earlyspring.nyc';

// Match Morgan's NewContactModal — keep the lists in sync so the
// add-on offers the same options as the web UI.
const TYPE_OPTIONS = [
  { id: '',         label: 'Type…' },
  { id: 'brand',    label: 'Brand' },
  { id: 'agency',   label: 'Agency' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'agent',    label: 'Agent' },
  { id: 'press',    label: 'Press' },
  { id: 'internal', label: 'Internal (me / team)' },
];
const STATUS_OPTIONS = [
  { id: 'prospect', label: 'Prospect' },
  { id: 'pitching', label: 'Pitching' },
  { id: 'active',   label: 'Active' },
  { id: 'past',     label: 'Past' },
  { id: 'vendor',   label: 'Vendor' },
  { id: 'press',    label: 'Press' },
];
const PROP_REFRESH = 'morgan_refresh_token';
const CACHE_ACCESS = 'morgan_access_token';
const CACHE_PENDING_DEVICE = 'morgan_pending_device_code';

// ─────────────────────────────────────────────────────────────────
// Trigger entry points
// ─────────────────────────────────────────────────────────────────

function onHomepage(e) {
  if (!isConnected()) return connectCard();
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Morgan CRM').setSubtitle('Open an email to add the sender'))
    .addSection(
      CardService.newCardSection().addWidget(
        CardService.newTextParagraph().setText('Open any email and the Morgan panel will appear in the right sidebar.')
      ).addWidget(
        CardService.newTextButton()
          .setText('Disconnect from Morgan')
          .setOnClickAction(CardService.newAction().setFunctionName('handleDisconnect'))
      )
    ).build();
}

function onGmailMessage(e) {
  if (!isConnected()) return connectCard();
  try {
    var accessToken = e.gmail && e.gmail.accessToken;
    var messageId = e.gmail && e.gmail.messageId;
    if (!accessToken || !messageId) return errorCard('Gmail context missing.');
    GmailApp.setCurrentMessageAccessToken(accessToken);

    var msg = GmailApp.getMessageById(messageId);
    var participants = collectParticipants(msg);
    if (!participants.length) return errorCard('No addresses found on this message.');
    cacheParticipants(messageId, participants);
    return renderParticipantCard(messageId, 0);
  } catch (err) {
    return errorCard('Error: ' + err.message);
  }
}

// Gather everyone on the open message: sender + all To + all CC +
// Reply-To, deduped by email (case-insensitive), with the user's
// own address dropped so they can't try to add themselves. From
// goes first so the original sender is the default landing card.
function collectParticipants(msg) {
  var seen = {};
  var out = [];
  var myEmail = '';
  try { myEmail = (Session.getActiveUser().getEmail() || '').toLowerCase(); } catch (e) {}

  var push = function (raw) {
    if (!raw) return;
    raw.split(',').forEach(function (chunk) {
      var p = parseAddress(chunk.trim());
      if (!p.email || p.email === myEmail) return;
      if (seen[p.email]) return;
      seen[p.email] = true;
      out.push(p);
    });
  };

  // Order matters — From shows first.
  push(msg.getFrom());
  try { push(msg.getReplyTo()); } catch (e) {}
  push(msg.getTo());
  push(msg.getCc());
  return out;
}

function cacheParticipants(messageId, participants) {
  try {
    CacheService.getUserCache().put('participants_' + messageId, JSON.stringify(participants), 600);
  } catch (e) {}
}

function loadParticipants(messageId) {
  try {
    var raw = CacheService.getUserCache().get('participants_' + messageId);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return null;
}

// Render the card for participant at `index`. Looks up the person
// in Morgan first — if found, show matchCard; otherwise addCard.
// Both render with their own embedded nav arrows.
function renderParticipantCard(messageId, index) {
  var participants = loadParticipants(messageId) || [];
  if (!participants.length) return errorCard('Participant list expired. Re-open the email.');
  if (index < 0) index = 0;
  if (index >= participants.length) index = participants.length - 1;
  var person = participants[index];
  var nav = { messageId: messageId, index: index, total: participants.length };
  var existing = person.email ? lookupContact(person.email) : null;
  return existing ? matchCard(existing, person, nav) : addCard(person, null, nav);
}

// Build a prev/next navigation section that drops into a card
// builder. Returns null when there's only one participant, so the
// caller can skip adding it.
function buildNavSection(nav) {
  if (!nav || nav.total <= 1) return null;
  var section = CardService.newCardSection();
  var counter = CardService.newTextParagraph().setText('Person <b>' + (nav.index + 1) + '</b> of <b>' + nav.total + '</b> on this email');
  section.addWidget(counter);
  var buttons = CardService.newButtonSet();
  if (nav.index > 0) {
    buttons.addButton(
      CardService.newTextButton()
        .setText('← Prev')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('handlePrevParticipant')
          .setParameters({ message_id: nav.messageId, index: String(nav.index) }))
    );
  }
  if (nav.index < nav.total - 1) {
    buttons.addButton(
      CardService.newTextButton()
        .setText('Next →')
        .setOnClickAction(CardService.newAction()
          .setFunctionName('handleNextParticipant')
          .setParameters({ message_id: nav.messageId, index: String(nav.index) }))
    );
  }
  section.addWidget(buttons);
  return section;
}

function handlePrevParticipant(e) {
  var p = (e && e.parameters) || {};
  var messageId = p.message_id;
  var index = parseInt(p.index || '0', 10);
  if (!messageId) return notify('No message context.');
  var nav = CardService.newNavigation().updateCard(renderParticipantCard(messageId, index - 1));
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

function handleNextParticipant(e) {
  var p = (e && e.parameters) || {};
  var messageId = p.message_id;
  var index = parseInt(p.index || '0', 10);
  if (!messageId) return notify('No message context.');
  var nav = CardService.newNavigation().updateCard(renderParticipantCard(messageId, index + 1));
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

// ─────────────────────────────────────────────────────────────────
// Connection (device-flow OAuth)
// ─────────────────────────────────────────────────────────────────

function isConnected() {
  return !!PropertiesService.getUserProperties().getProperty(PROP_REFRESH);
}

function connectCard() {
  var card = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Morgan CRM').setSubtitle('Not connected'))
    .addSection(
      CardService.newCardSection()
        .addWidget(CardService.newTextParagraph().setText('Connect this add-on to your Morgan account to add senders to your CRM.'))
        .addWidget(
          CardService.newTextButton()
            .setText('Connect to Morgan')
            .setOnClickAction(CardService.newAction().setFunctionName('handleStartConnect'))
            .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
        )
    );
  return card.build();
}

// Step 1: POST /api/addon-auth/start → cache the device_code,
// show a card with the user_code + a link to the verification URL.
function handleStartConnect(e) {
  var resp = fetchJson('/api/addon-auth/start', { method: 'post', payload: JSON.stringify({ device_label: 'Gmail Add-on' }) });
  if (!resp || !resp.device_code) return notify('Failed to start connection.');
  CacheService.getUserCache().put(CACHE_PENDING_DEVICE, resp.device_code, 600);

  var nav = CardService.newNavigation().pushCard(
    CardService.newCardBuilder()
      .setHeader(CardService.newCardHeader().setTitle('Approve in Morgan'))
      .addSection(
        CardService.newCardSection()
          .addWidget(CardService.newTextParagraph().setText('1. Open Morgan in a new tab using the link below.\n2. Click <b>Approve</b>.\n3. Come back here and click <b>I approved it</b>.'))
          .addWidget(CardService.newTextParagraph().setText('<b>Code:</b> <font face="monospace">' + escapeHtml(resp.user_code) + '</font>'))
          .addWidget(
            CardService.newTextButton()
              .setText('Open Morgan to approve')
              .setOpenLink(CardService.newOpenLink().setUrl(resp.verification_url).setOpenAs(CardService.OpenAs.FULL_SIZE))
          )
          .addWidget(
            CardService.newTextButton()
              .setText('I approved it')
              .setOnClickAction(CardService.newAction().setFunctionName('handlePollConnect'))
              .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
          )
      ).build()
  );
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

// Step 2: POST /api/addon-auth/poll → if approved, store the
// refresh_token in UserProperties.
function handlePollConnect(e) {
  var deviceCode = CacheService.getUserCache().get(CACHE_PENDING_DEVICE);
  if (!deviceCode) return notify('Connection expired. Start again.');
  var resp = fetchJson('/api/addon-auth/poll', { method: 'post', payload: JSON.stringify({ device_code: deviceCode }) }, { allowedStatuses: [200, 202, 410, 403] });
  if (!resp) return notify('Network error.');
  if (resp.status === 'pending') return notify('Not approved yet. Approve in Morgan, then try again.');
  if (resp.status === 'expired') {
    CacheService.getUserCache().remove(CACHE_PENDING_DEVICE);
    return notify('Connection expired. Start again.');
  }
  if (resp.status === 'revoked') return notify('Connection was revoked.');
  if (resp.status === 'approved' && resp.refresh_token) {
    PropertiesService.getUserProperties().setProperty(PROP_REFRESH, resp.refresh_token);
    CacheService.getUserCache().remove(CACHE_PENDING_DEVICE);
    return navigateRoot();
  }
  return notify('Unexpected response.');
}

function handleDisconnect(e) {
  PropertiesService.getUserProperties().deleteProperty(PROP_REFRESH);
  CacheService.getUserCache().remove(CACHE_ACCESS);
  return navigateRoot();
}

// ─────────────────────────────────────────────────────────────────
// Morgan API calls (with auto-refresh)
// ─────────────────────────────────────────────────────────────────

function getAccessToken() {
  var cache = CacheService.getUserCache();
  var cached = cache.get(CACHE_ACCESS);
  if (cached) return cached;
  var refresh = PropertiesService.getUserProperties().getProperty(PROP_REFRESH);
  if (!refresh) return null;
  var resp = fetchJson('/api/addon-auth/refresh', { method: 'post', payload: JSON.stringify({ refresh_token: refresh }) }, { allowedStatuses: [200, 401, 403] });
  if (!resp || !resp.access_token) {
    if (resp && (resp.error === 'revoked' || resp.error === 'invalid_refresh_token')) {
      PropertiesService.getUserProperties().deleteProperty(PROP_REFRESH);
    }
    return null;
  }
  // Cache for slightly less than the token's TTL so we never use a
  // stale one. Apps Script CacheService max is 6 hours.
  var ttl = Math.max(60, Math.min(21600, (resp.expires_in || 3600) - 300));
  cache.put(CACHE_ACCESS, resp.access_token, ttl);
  return resp.access_token;
}

function morganGet(path) {
  var token = getAccessToken();
  if (!token) return null;
  var resp = UrlFetchApp.fetch(MORGAN_BASE + path, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + token },
    muteHttpExceptions: true,
  });
  var code = resp.getResponseCode();
  if (code === 404) return null;
  if (code >= 400) throw new Error('GET ' + path + ' → ' + code + ': ' + resp.getContentText().slice(0, 200));
  return JSON.parse(resp.getContentText() || '{}');
}

function morganPost(path, body) {
  var token = getAccessToken();
  if (!token) throw new Error('Not connected');
  var resp = UrlFetchApp.fetch(MORGAN_BASE + path, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + token },
    payload: JSON.stringify(body || {}),
    muteHttpExceptions: true,
  });
  var code = resp.getResponseCode();
  if (code >= 400) throw new Error('POST ' + path + ' → ' + code + ': ' + resp.getContentText().slice(0, 200));
  return JSON.parse(resp.getContentText() || '{}');
}

function fetchJson(path, options, opts) {
  opts = opts || {};
  var allowed = opts.allowedStatuses || null;
  try {
    var resp = UrlFetchApp.fetch(MORGAN_BASE + path, Object.assign({
      contentType: 'application/json',
      muteHttpExceptions: true,
    }, options || {}));
    var code = resp.getResponseCode();
    if (code >= 400 && (!allowed || allowed.indexOf(code) === -1)) {
      console.error('[fetchJson] ' + path + ' → ' + code + ': ' + resp.getContentText().slice(0, 200));
      return null;
    }
    return JSON.parse(resp.getContentText() || '{}');
  } catch (e) {
    console.error('[fetchJson] ' + path + ' threw: ' + e.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Domain calls
// ─────────────────────────────────────────────────────────────────

function lookupContact(email) {
  try {
    var out = morganGet('/api/addon/contacts?email=' + encodeURIComponent(email));
    return out && out.contact ? out.contact : null;
  } catch (e) { return null; }
}

function createContact(payload) {
  var out = morganPost('/api/addon/contacts', payload);
  return out && out.contact ? out.contact : null;
}

function rocketReachLookup(email, name, company) {
  var body = { email: email };
  if (name) body.name = name;
  if (company) body.current_employer = company;
  try {
    var out = morganPost('/api/rocketreach', body);
    return out && out.profile ? out.profile : null;
  } catch (e) {
    console.error('[rr] lookup failed: ' + e.message);
    return null;
  }
}

function listProjects() {
  try {
    var out = morganGet('/api/addon/projects');
    return out && Array.isArray(out.projects) ? out.projects : [];
  } catch (e) { return []; }
}

function linkContactToProject(contactId, projectId) {
  return morganPost('/api/addon/contact-project-link', { contact_id: contactId, project_id: projectId });
}

// ─────────────────────────────────────────────────────────────────
// UI cards
// ─────────────────────────────────────────────────────────────────

function matchCard(contact, parsed, nav) {
  var name = [contact.first_name, contact.last_name].filter(Boolean).join(' ').trim() || contact.email || '(no name)';
  var details = [];
  if (contact.title) details.push(contact.title);
  if (contact.company) details.push(contact.company);

  var section = CardService.newCardSection()
    .addWidget(CardService.newTextParagraph().setText('<b>' + escapeHtml(name) + '</b>'))
    .addWidget(CardService.newTextParagraph().setText(escapeHtml(contact.email || parsed.email)));
  if (details.length) section.addWidget(CardService.newTextParagraph().setText(escapeHtml(details.join(' · '))));

  var projects = listProjects();
  if (projects.length) {
    var dd = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle('Link to project')
      .setFieldName('project_id')
      .addItem('— none —', '', true);
    projects.forEach(function (p) {
      var label = p.client ? (p.name + ' · ' + p.client) : p.name;
      dd.addItem(label, p.id, false);
    });
    section.addWidget(dd);
    section.addWidget(
      CardService.newTextButton()
        .setText('Link contact to project')
        .setOnClickAction(CardService.newAction().setFunctionName('handleLinkExisting').setParameters(
          nav ? { contact_id: contact.id, message_id: nav.messageId, index: String(nav.index) } : { contact_id: contact.id }
        ))
    );
  }

  var builder = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Already in CRM').setSubtitle(parsed.email))
    .addSection(section);
  var navSection = buildNavSection(nav);
  if (navSection) builder.addSection(navSection);
  return builder.build();
}

function addCard(parsed, rrPreview, nav) {
  var initialFirst = parsed.firstName || '';
  var initialLast = parsed.lastName || '';
  var initialCompany = '';
  var initialTitle = '';
  var initialLinkedin = '';
  var subtitle = 'Not in CRM';

  if (rrPreview) {
    initialFirst = rrPreview.first_name || initialFirst;
    initialLast = rrPreview.last_name || initialLast;
    initialCompany = rrPreview.current_employer || rrPreview.company || initialCompany;
    initialTitle = rrPreview.current_title || rrPreview.title || initialTitle;
    initialLinkedin = rrPreview.linkedin_url || '';
    subtitle = 'Enriched via RocketReach';
  }

  var section = CardService.newCardSection()
    .addWidget(CardService.newTextInput().setFieldName('first_name').setTitle('First name').setValue(initialFirst))
    .addWidget(CardService.newTextInput().setFieldName('last_name').setTitle('Last name').setValue(initialLast))
    .addWidget(CardService.newTextInput().setFieldName('email').setTitle('Email').setValue(parsed.email))
    .addWidget(CardService.newTextInput().setFieldName('company').setTitle('Company').setValue(initialCompany))
    .addWidget(CardService.newTextInput().setFieldName('title').setTitle('Title').setValue(initialTitle))
    .addWidget(CardService.newTextInput().setFieldName('linkedin_url').setTitle('LinkedIn URL').setValue(initialLinkedin));

  var typeSelect = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('Type')
    .setFieldName('contact_type');
  TYPE_OPTIONS.forEach(function (o) { typeSelect.addItem(o.label, o.id, o.id === ''); });
  section.addWidget(typeSelect);

  var statusSelect = CardService.newSelectionInput()
    .setType(CardService.SelectionInputType.DROPDOWN)
    .setTitle('Status')
    .setFieldName('status');
  STATUS_OPTIONS.forEach(function (o) { statusSelect.addItem(o.label, o.id, o.id === 'prospect'); });
  section.addWidget(statusSelect);

  var projects = listProjects();
  if (projects.length) {
    var dd = CardService.newSelectionInput()
      .setType(CardService.SelectionInputType.DROPDOWN)
      .setTitle('Link to project (optional)')
      .setFieldName('project_id')
      .addItem('— none —', '', true);
    projects.forEach(function (p) {
      var label = p.client ? (p.name + ' · ' + p.client) : p.name;
      dd.addItem(label, p.id, false);
    });
    section.addWidget(dd);
  }

  // Preserve nav context on every action so the re-render after
  // Enrich / Add lands on the same person in the same email.
  var navParams = nav ? { message_id: nav.messageId, index: String(nav.index) } : {};

  if (!rrPreview) {
    section.addWidget(
      CardService.newTextButton()
        .setText('Verify via RocketReach')
        .setOnClickAction(CardService.newAction().setFunctionName('handleEnrich').setParameters(
          Object.assign({}, navParams, { email: parsed.email, name: (initialFirst + ' ' + initialLast).trim() })
        ))
    );
  }
  section.addWidget(
    CardService.newTextButton()
      .setText('Add to CRM')
      .setOnClickAction(CardService.newAction().setFunctionName('handleAdd').setParameters(
        Object.assign({}, navParams, { email: parsed.email })
      ))
      .setTextButtonStyle(CardService.TextButtonStyle.FILLED)
  );

  var builder = CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Add to CRM').setSubtitle(subtitle))
    .addSection(section);
  var navSection = buildNavSection(nav);
  if (navSection) builder.addSection(navSection);
  return builder.build();
}

function handleEnrich(e) {
  var formInputs = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  var params = (e && e.parameters) || {};
  var parsed = {
    email: getInput(formInputs, 'email') || params.email || '',
    firstName: getInput(formInputs, 'first_name'),
    lastName: getInput(formInputs, 'last_name'),
  };
  var rr = rocketReachLookup(parsed.email, ((parsed.firstName || '') + ' ' + (parsed.lastName || '')).trim(), getInput(formInputs, 'company'));
  if (!rr) return notify('RocketReach found nothing for this address.');
  var navCtx = null;
  if (params.message_id) {
    var participants = loadParticipants(params.message_id) || [];
    navCtx = { messageId: params.message_id, index: parseInt(params.index || '0', 10), total: participants.length };
  }
  var nav = CardService.newNavigation().updateCard(addCard(parsed, rr, navCtx));
  return CardService.newActionResponseBuilder().setNavigation(nav).build();
}

function handleAdd(e) {
  var formInputs = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  var params = (e && e.parameters) || {};
  var payload = {
    first_name: getInput(formInputs, 'first_name'),
    last_name: getInput(formInputs, 'last_name'),
    email: getInput(formInputs, 'email') || params.email || '',
    company: getInput(formInputs, 'company'),
    title: getInput(formInputs, 'title'),
    linkedin_url: getInput(formInputs, 'linkedin_url'),
    contact_type: getInput(formInputs, 'contact_type'),
    status: getInput(formInputs, 'status'),
    source: 'gmail_addon',
  };
  var projectId = getInput(formInputs, 'project_id');

  var contact;
  try { contact = createContact(payload); }
  catch (err) { return notify('Add failed: ' + err.message); }
  if (!contact) return notify('Add failed.');

  var summary = 'Added ' + (contact.first_name || contact.email || 'contact') + ' to CRM.';
  if (projectId) {
    try {
      linkContactToProject(contact.id, projectId);
      summary += ' Linked to project.';
    } catch (err) { summary += ' (Project link failed: ' + err.message + ')'; }
  }
  // Re-render via renderParticipantCard so the nav arrows persist
  // and the user can move on to the next person on the email.
  var nextCard;
  if (params.message_id) {
    nextCard = renderParticipantCard(params.message_id, parseInt(params.index || '0', 10));
  } else {
    nextCard = matchCard(contact, { email: payload.email }, null);
  }
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(summary))
    .setNavigation(CardService.newNavigation().updateCard(nextCard))
    .build();
}

function handleLinkExisting(e) {
  var formInputs = (e.commonEventObject && e.commonEventObject.formInputs) || {};
  var projectId = getInput(formInputs, 'project_id');
  var contactId = e.parameters && e.parameters.contact_id;
  if (!projectId) return notify('Pick a project first.');
  if (!contactId) return notify('Missing contact id.');
  try { linkContactToProject(contactId, projectId); }
  catch (err) { return notify('Link failed: ' + err.message); }
  return notify('Linked to project.');
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function navigateRoot() {
  return CardService.newActionResponseBuilder()
    .setNavigation(CardService.newNavigation().popToRoot().updateCard(onHomepage()))
    .build();
}

function notify(text) {
  return CardService.newActionResponseBuilder()
    .setNotification(CardService.newNotification().setText(text))
    .build();
}

function errorCard(text) {
  return CardService.newCardBuilder()
    .setHeader(CardService.newCardHeader().setTitle('Morgan CRM'))
    .addSection(CardService.newCardSection().addWidget(CardService.newTextParagraph().setText(text)))
    .build();
}

// "Kamil Tyebally <kamil@earlyspring.nyc>" → { email, firstName, lastName }
function parseAddress(raw) {
  if (!raw) return { email: '', firstName: '', lastName: '' };
  var m = raw.match(/^(.*?)\s*<([^>]+)>\s*$/);
  var name = '', email = '';
  if (m) { name = m[1].replace(/^"|"$/g, '').trim(); email = m[2].toLowerCase().trim(); }
  else { email = raw.toLowerCase().trim(); }
  var parts = name ? name.split(/\s+/) : [];
  var firstName = parts[0] || '';
  var lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
  return { email: email, firstName: firstName, lastName: lastName };
}

function getInput(formInputs, key) {
  var v = formInputs && formInputs[key];
  if (!v) return '';
  if (v.stringInputs && v.stringInputs.value && v.stringInputs.value.length) return v.stringInputs.value[0];
  return '';
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
