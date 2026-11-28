// assets/site.js of the generated school website (lib/websiteKit).
// Browser code: no backticks or dollar-brace sequences inside, because it
// lives in a String.raw template. Everything from the API is inserted as text
// (never innerHTML), so school content cannot inject markup into the site.
export const SITE_JS = String.raw`/* School website connected to Praavyo.
   Data comes from api.php (the connector), which adds the school's API key on
   the server. Never put the API key in this file. */
(function () {
  "use strict";

  var API = "api.php";
  var app = document.getElementById("app");
  // forms = { general, admission } from the API: the fields and the
  // admission season (status OPEN / CLOSED, notice) — never hard-coded here.
  var state = { school: null, forms: null };
  function admission() { return (state.forms && state.forms.admission) || null; }
  function admissionOpen() { var a = admission(); return Boolean(a && a.status === "OPEN"); }

  // ── helpers ─────────────────────────────────────────────────────────────
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (key) {
        var value = attrs[key];
        if (value === null || value === undefined || value === false) return;
        if (key === "class") el.className = value;
        else if (key === "text") el.textContent = value;
        else if (key.slice(0, 2) === "on" && typeof value === "function") el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value === true ? "" : String(value));
      });
    }
    for (var i = 2; i < arguments.length; i++) append(el, arguments[i]);
    return el;
  }
  function append(el, child) {
    if (child === null || child === undefined || child === false) return;
    if (Array.isArray(child)) { child.forEach(function (c) { append(el, c); }); return; }
    el.appendChild(typeof child === "object" ? child : document.createTextNode(String(child)));
  }

  function request(path, options) {
    var params = (options && options.params) || {};
    var query = "?path=" + encodeURIComponent(path);
    Object.keys(params).forEach(function (key) { query += "&" + key + "=" + encodeURIComponent(params[key]); });
    var init = { headers: { Accept: "application/json" } };
    if (options && options.body) {
      init.method = "POST";
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    return fetch(API + query, init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok || json.success === false) {
          var error = new Error(json.message || "Request failed (" + res.status + ")");
          error.status = res.status;
          throw error;
        }
        return options && options.full ? json : json.data;
      });
    });
  }
  function get(path, params) { return request(path, { params: params }); }

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function toDate(value) { var d = value ? new Date(value) : null; return d && !isNaN(d.getTime()) ? d : null; }
  function fmtDate(value) {
    var d = toDate(value);
    return d ? d.getDate() + " " + MONTHS[d.getMonth()] + " " + d.getFullYear() : "";
  }
  function dateTile(value) {
    var d = toDate(value);
    if (!d) return null;
    return h("div", { class: "date-tile" }, h("b", { text: d.getDate() }), h("span", { text: MONTHS[d.getMonth()] + " " + String(d.getFullYear()).slice(2) }));
  }
  function label(value) {
    var text = String(value || "").replace(/_/g, " ").toLowerCase();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  function safeHref(href) { return /^(https?:|mailto:)/i.test(String(href || "")) ? href : ""; }
  function link(route, attrs) {
    var a = h("a", Object.assign({ href: "#/" + route }, attrs || {}));
    for (var i = 2; i < arguments.length; i++) append(a, arguments[i]);
    return a;
  }

  // Praavyo writing blocks → elements (see the API guide: "blocks").
  function inline(nodes) {
    return (nodes || []).map(function (node) {
      if (node.type === "text") return document.createTextNode(node.text);
      if (node.type === "bold") return h("strong", null, inline(node.children));
      if (node.type === "italic") return h("em", null, inline(node.children));
      if (node.type === "highlight") return h("mark", null, inline(node.children));
      if (node.type === "link") {
        var href = safeHref(node.href);
        return href ? h("a", { href: href, target: "_blank", rel: "noopener noreferrer" }, inline(node.children)) : h("span", null, inline(node.children));
      }
      return null;
    });
  }
  function blocks(list) {
    return (list || []).map(function (block) {
      if (block.type === "heading") return h("h3", null, inline(block.inline));
      if (block.type === "bullets") return h("ul", null, block.items.map(function (item) { return h("li", null, inline(item)); }));
      if (block.type === "numbers") return h("ol", { start: block.start || 1 }, block.items.map(function (item) { return h("li", null, inline(item)); }));
      return h("p", null, inline(block.inline));
    });
  }
  function paragraphs(text) {
    return String(text || "").split(/\n\s*\n/).filter(function (p) { return p.trim(); }).map(function (p) {
      return h("p", { class: "pre-line", text: p.trim() });
    });
  }

  function loading() { return h("div", { class: "loading", text: "Loading…" }); }
  function failure(error) {
    if (window.console) console.error("[school website]", error);
    return h("div", { class: "error-box", text: "This section could not be loaded right now. Please try again later." });
  }
  function empty(text) { return h("div", { class: "empty", text: text }); }

  function render(node) {
    app.textContent = "";
    append(app, node);
    app.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function pageHead(title, intro) {
    return h("div", { class: "container page-head" }, h("h1", { text: title }), intro ? h("p", { text: intro }) : null);
  }

  // ── cards ───────────────────────────────────────────────────────────────
  var CARDS = {
    events: function (item) {
      return link("events/" + item.id, { class: "card" },
        h("div", { class: "row-card" }, dateTile(item.date),
          h("div", { class: "stack", style: "gap:6px" },
            h("h3", { text: item.title }),
            h("div", { class: "meta" },
              h("span", { class: "badge", text: item.kind === "PROGRAM" ? "Program" : label(item.type || "Event") }),
              item.venue ? h("span", { text: item.venue }) : null,
              item.status === "COMPLETED" ? h("span", { text: "Completed" }) : null),
            h("p", { text: item.excerpt || "" }))));
    },
    notices: function (item) {
      var urgent = /URGENT|HIGH/i.test(item.priority || "");
      return link("notices/" + item.id, { class: "card" },
        h("div", { class: "row-card" }, dateTile(item.publishedAt),
          h("div", { class: "stack", style: "gap:6px" },
            h("h3", { text: item.title }),
            urgent ? h("div", null, h("span", { class: "badge badge-urgent", text: "Important" })) : null,
            h("p", { text: item.excerpt || "" }))));
    },
    writings: function (item) {
      return link("writings/" + item.id, { class: "card" },
        item.coverImageUrl ? h("img", { class: "cover", src: item.coverImageUrl, alt: "", loading: "lazy" }) : null,
        h("div", { class: "body" },
          h("div", { class: "meta" }, h("span", { class: "chip", text: label(item.category) })),
          h("h3", { text: item.title }),
          h("p", { text: item.excerpt || "" }),
          h("div", { class: "meta", text: item.authorName + (item.authorGrade ? " · " + item.authorGrade : "") + (item.publishedAt ? " · " + fmtDate(item.publishedAt) : "") })));
    },
    magazines: function (item) {
      return link("magazine/" + item.id, { class: "card" },
        h("div", { class: "body" },
          h("span", { class: "chip", text: "School magazine" }),
          h("h3", { text: item.title }),
          h("div", { class: "meta", text: (item.publishedAt ? fmtDate(item.publishedAt) + " · " : "") + item.articleCount + (item.articleCount === 1 ? " article" : " articles") })));
    },
    gallery: function (item) {
      return link("gallery/" + item.id, { class: "card" },
        item.coverUrl ? h("img", { class: "cover", src: item.coverUrl, alt: "", loading: "lazy" }) : null,
        h("div", { class: "body" },
          h("h3", { text: item.title }),
          h("div", { class: "meta", text: item.photoCount + (item.photoCount === 1 ? " photo" : " photos") + (item.takenOn ? " · " + fmtDate(item.takenOn) : "") })));
    }
  };

  // ── pages ───────────────────────────────────────────────────────────────
  function listPage(resource, title, intro, emptyText) {
    var grid = h("div", { class: resource === "events" || resource === "notices" ? "stack" : "grid" });
    var more = h("div", { class: "more" });
    var page = 1;
    function load() {
      more.textContent = "";
      append(more, h("span", { class: "meta", text: "Loading…" }));
      get(resource, { page: page, limit: 12 }).then(function (data) {
        more.textContent = "";
        if (page === 1 && !data.items.length) append(grid, empty(emptyText));
        data.items.forEach(function (item) { append(grid, CARDS[resource](item)); });
        if (data.pagination && page < data.pagination.totalPages) {
          append(more, h("button", { class: "btn btn-ghost", type: "button", onclick: function () { page += 1; load(); } }, "Load more"));
        }
      }).catch(function (error) { more.textContent = ""; append(grid, failure(error)); });
    }
    load();
    return [pageHead(title, intro), h("section", { class: "section", style: "padding-top:16px" }, h("div", { class: "container" }, grid, more))];
  }

  function detailPage(resource, id, backRoute, backText, build) {
    var box = h("div", { class: "container section" }, link(backRoute, { class: "back" }, "← " + backText), loading());
    get(resource + "/" + id).then(function (item) {
      box.removeChild(box.lastChild);
      append(box, build(item));
      document.title = item.title + " · " + schoolName();
    }).catch(function (error) {
      box.removeChild(box.lastChild);
      append(box, error.status === 404 ? empty("This item is no longer available.") : failure(error));
    });
    return box;
  }

  function schoolName() { return (state.school && state.school.name) || document.title; }

  function homePage() {
    var s = state.school || {};
    var show = s.showcase || {};
    var hero = h("section", { class: "hero" },
      h("div", { class: "container" },
        s.logoUrl ? h("img", { class: "logo", src: s.logoUrl, alt: s.name + " logo" }) : null,
        h("h1", { text: s.name || "" }),
        show.tagline ? h("p", { text: show.tagline }) : null,
        show.motto ? h("p", { class: "motto", text: "“" + show.motto + "”" }) : null,
        h("div", { class: "actions" },
          admission() ? link("admission", { class: "btn btn-light" }, admissionOpen() ? "Apply for admission" : "Apply for next year") : null,
          link("contact", { class: "btn btn-ghost", style: "color:#fff;border-color:rgba(255,255,255,.5)" }, "Contact us"))));
    if (s.bannerUrl) hero.style.backgroundImage = "url(\"" + s.bannerUrl.replace(/"/g, "%22") + "\")";

    function strip(resource, title, route, limit) {
      var list = h("div", { class: resource === "events" || resource === "notices" ? "stack" : "grid" }, loading());
      get(resource, { page: 1, limit: limit }).then(function (data) {
        list.textContent = "";
        if (!data.items.length) { section.remove(); return; }
        data.items.forEach(function (item) { append(list, CARDS[resource](item)); });
      }).catch(function () { section.remove(); });
      var section = h("section", { class: "section" }, h("div", { class: "container" },
        h("div", { class: "section-head" }, h("h2", { text: title }), link(route, null, "View all →")), list));
      return section;
    }

    var about = show.summary ? h("section", { class: "section" }, h("div", { class: "container two-col" },
      h("div", null, h("h2", { text: "About us" }), paragraphs(show.summary).slice(0, 2), link("about", { class: "btn btn-ghost" }, "Read more")),
      factsPanel())) : null;

    return [hero, about,
      strip("notices", "Latest notices", "notices", 3),
      strip("events", "Events", "events", 3),
      strip("writings", "Student writings", "writings", 3),
      strip("gallery", "Gallery", "gallery", 4)];
  }

  function factsPanel() {
    var s = state.school || {};
    var rows = [
      ["Principal", s.principalName],
      ["Established", s.establishedYear],
      ["Address", s.location],
      ["Phone", s.phone],
      ["Email", s.email]
    ].filter(function (row) { return row[1]; });
    if (!rows.length) return null;
    return h("dl", { class: "panel facts" }, rows.map(function (row) { return h("div", null, h("dt", { text: row[0] }), h("dd", { text: row[1] })); }));
  }

  function aboutPage() {
    var s = state.school || {};
    var show = s.showcase || {};
    var highlights = show.highlights || [];
    return [pageHead("About " + (s.name || "us"), show.tagline),
      h("section", { class: "section", style: "padding-top:16px" }, h("div", { class: "container two-col" },
        h("div", { class: "prose" },
          show.summary ? paragraphs(show.summary) : h("p", { text: "More about our school is coming soon." }),
          highlights.length ? [h("h3", { text: "Highlights" }), h("ul", null, highlights.map(function (item) { return h("li", { text: item }); }))] : null),
        factsPanel()))];
  }

  function eventDetail(item) {
    return h("article", { class: "article" },
      h("h1", { text: item.title }),
      h("div", { class: "meta" },
        h("span", { text: fmtDate(item.date) }),
        h("span", { class: "badge", text: item.kind === "PROGRAM" ? "Program" : label(item.type || "Event") }),
        item.venue ? h("span", { text: item.venue }) : null),
      h("div", { class: "prose", style: "margin-top:20px" }, paragraphs(item.description)),
      item.eligibleGrades && item.eligibleGrades.length ? h("p", { class: "meta", text: "For: " + item.eligibleGrades.join(", ") }) : null,
      item.registrationDeadline ? h("p", { class: "meta", text: "Register by " + fmtDate(item.registrationDeadline) }) : null);
  }
  function noticeDetail(item) {
    return h("article", { class: "article" },
      h("h1", { text: item.title }),
      h("div", { class: "meta", text: fmtDate(item.publishedAt) }),
      h("div", { class: "prose", style: "margin-top:20px" }, paragraphs(item.content)));
  }
  function writingBody(item) {
    return [
      item.coverImageUrl ? h("img", { class: "cover", src: item.coverImageUrl, alt: "" }) : null,
      h("div", { class: "prose" }, blocks(item.blocks),
        (item.images || []).filter(function (img) { return img.url !== item.coverImageUrl; }).map(function (img) {
          return h("figure", null, h("img", { src: img.url, alt: img.altText || img.caption || "", loading: "lazy" }), img.caption ? h("figcaption", { text: img.caption }) : null);
        }))
    ];
  }
  function writingDetail(item) {
    return h("article", { class: "article" },
      h("span", { class: "chip", text: label(item.category) }),
      h("h1", { text: item.title, style: "margin-top:12px" }),
      h("div", { class: "meta", text: "By " + item.authorName + (item.authorGrade ? ", " + item.authorGrade : "") + (item.publishedAt ? " · " + fmtDate(item.publishedAt) : "") }),
      writingBody(item));
  }
  function magazineDetail(issue) {
    return h("div", { class: "article" },
      h("span", { class: "chip", text: "School magazine" }),
      h("h1", { text: issue.title, style: "margin-top:12px" }),
      h("p", { class: "meta", text: (issue.publishedAt ? fmtDate(issue.publishedAt) + " · " : "") + issue.articleCount + " articles" }),
      issue.articles.length ? h("div", { class: "stack" }, issue.articles.map(function (article, index) {
        return h("details", { class: "article-item", open: index === 0 },
          h("summary", { text: article.title }),
          h("p", { class: "meta", text: "By " + article.authorName + (article.authorGrade ? ", " + article.authorGrade : "") }),
          writingBody(article));
      })) : empty("This issue has no articles yet."));
  }
  function albumDetail(album) {
    var photos = album.photos || [];
    return h("div", null,
      h("h1", { text: album.title }),
      h("p", { class: "meta", text: photos.length + " photos" + (album.takenOn ? " · " + fmtDate(album.takenOn) : "") }),
      album.description ? h("div", { class: "prose" }, paragraphs(album.description)) : null,
      h("div", { class: "photos", style: "margin-top:20px" }, photos.map(function (photo, index) {
        return h("button", { type: "button", "aria-label": "Open photo " + (index + 1), onclick: function () { lightbox(photos, index); } },
          h("img", { src: photo.url, alt: photo.caption || "", loading: "lazy" }));
      })));
  }
  function lightbox(photos, start) {
    var index = start;
    var img = h("img", { alt: "" });
    var caption = h("figcaption");
    function show() { img.src = photos[index].url; img.alt = photos[index].caption || ""; caption.textContent = photos[index].caption || ""; }
    function close() { document.removeEventListener("keydown", onKey); box.remove(); }
    function step(by) { index = (index + by + photos.length) % photos.length; show(); }
    function onKey(event) {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    }
    var box = h("div", { class: "lightbox", role: "dialog", "aria-modal": "true", onclick: function (event) { if (event.target === box) close(); } },
      h("figure", { style: "margin:0" }, img, caption),
      h("button", { class: "lb-btn lb-close", type: "button", "aria-label": "Close", onclick: close }, "×"),
      photos.length > 1 ? h("button", { class: "lb-btn lb-prev", type: "button", "aria-label": "Previous", onclick: function () { step(-1); } }, "‹") : null,
      photos.length > 1 ? h("button", { class: "lb-btn lb-next", type: "button", "aria-label": "Next", onclick: function () { step(1); } }, "›") : null);
    document.addEventListener("keydown", onKey);
    show();
    document.body.appendChild(box);
  }

  // ── forms ───────────────────────────────────────────────────────────────
  // Built from the API's form definitions (GET /forms): the same fields on
  // every school website, and they follow Praavyo when it adds one.
  function field(spec) {
    var id = "f-" + spec.name;
    var control;
    if (spec.type === "select") {
      control = h("select", { id: id, name: spec.name, required: spec.required },
        h("option", { value: "", text: "Choose…" }),
        (spec.options || []).map(function (option) { return h("option", { value: option, text: option }); }));
    } else if (spec.type === "textarea") {
      control = h("textarea", { id: id, name: spec.name, rows: 5, required: spec.required, minlength: spec.minLength || null, maxlength: spec.maxLength || 2000, placeholder: spec.placeholder || "" });
    } else {
      var type = spec.type === "email" || spec.type === "tel" ? spec.type : "text";
      control = h("input", { id: id, name: spec.name, type: type, required: spec.required, minlength: spec.minLength || null, maxlength: spec.maxLength || 160, placeholder: spec.placeholder || "", autocomplete: spec.autocomplete || null });
    }
    var wide = spec.type === "textarea" || spec.name === "address" || spec.name === "previousSchool";
    return h("div", { class: "field" + (wide ? " full" : "") },
      h("label", { for: id }, spec.label, spec.required ? null : h("small", { text: " (optional)" })),
      control,
      spec.help ? h("small", { class: "meta", text: spec.help }) : null);
  }

  function inquiryForm(type) {
    var spec = type === "ADMISSION" ? admission() : state.forms && state.forms.general;
    if (!spec) return h("div", { class: "error-box", text: "This form could not be loaded. Please try again later." });
    var form = h("form", { class: "form" });
    var status = h("div", { class: "full" });
    append(form, spec.fields.map(field));
    // Hidden from people; bots that fill it are ignored.
    var trap = (spec.honeypot && spec.honeypot.name) || "website";
    append(form, h("div", { class: "hp", "aria-hidden": "true" }, h("label", { for: "f-" + trap, text: "Leave empty" }), h("input", { id: "f-" + trap, name: trap, tabindex: "-1", autocomplete: "off" })));
    var submit = h("button", { class: "btn btn-primary", type: "submit" }, type === "ADMISSION" ? (admissionOpen() ? "Send application" : "Apply for next year") : "Send inquiry");
    append(form, [status, h("div", { class: "full" }, submit)]);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var body = { type: type };
      Array.prototype.forEach.call(form.elements, function (el) { if (el.name) body[el.name] = el.value; });
      submit.disabled = true;
      status.textContent = "";
      request("inquiries", { body: body, full: true }).then(function (json) {
        var nextYear = Boolean(json && json.data && json.data.forNextYear);
        var done = h("div", { class: "form-success" },
          h("h3", { text: type === "ADMISSION" ? (nextYear ? "Application received for next year" : "Application received") : "Thank you" }),
          h("p", { text: type === "ADMISSION"
            ? (nextYear
              ? "Admissions are closed for this year, so your application will be considered for next year's admission. The school will contact you on the phone number you gave."
              : "We have received the admission application and will contact you on the phone number you gave.")
            : "Your message has reached the school. We will reply soon." }));
        form.replaceWith(done);
      }).catch(function (error) {
        submit.disabled = false;
        append(status, h("p", { class: "form-error", role: "alert", text: error.message || "Your message could not be sent. Please try again." }));
      });
    });
    return form;
  }

  function admissionInfo() {
    var a = admission() || {};
    var open = admissionOpen();
    var grades = (a.fields || []).filter(function (f) { return f.name === "grade"; })[0];
    return h("div", { class: "panel stack" + (open ? "" : " notice-closed") },
      h("h3", { text: open ? "Admissions open" : "Closed for this year" }),
      h("p", { style: "margin:0", text: a.notice || "" }),
      open && grades && grades.options.length ? h("div", { class: "meta" }, grades.options.map(function (g) { return h("span", { class: "chip", text: g }); })) : null,
      open && state.season && state.season.deadline ? h("p", { style: "margin:0" }, h("strong", { text: "Last date: " }), fmtDate(state.season.deadline)) : null,
      open && state.season && state.season.note ? h("div", { class: "prose" }, paragraphs(state.season.note)) : null);
  }

  function admissionPage() {
    var open = admissionOpen();
    return [pageHead("Admission", open ? "Fill in the form below and the school will contact you." : "Admissions are closed for this year — apply now for next year."),
      h("section", { class: "section", style: "padding-top:16px" }, h("div", { class: "container two-col" },
        h("div", { class: "panel" }, inquiryForm("ADMISSION")), admissionInfo()))];
  }

  function contactPage(initialType) {
    var s = state.school || {};
    var open = admissionOpen();
    var type = initialType === "ADMISSION" ? "ADMISSION" : "GENERAL";
    var holder = h("div");
    var tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "Inquiry type" });
    function tab(value, text) {
      return h("button", { type: "button", role: "tab", "aria-selected": String(type === value), onclick: function () { type = value; draw(); } }, text);
    }
    function draw() {
      tabs.textContent = "";
      append(tabs, [tab("GENERAL", "General inquiry"), tab("ADMISSION", open ? "Admission inquiry" : "Admission inquiry (next year)")]);
      holder.textContent = "";
      if (type === "ADMISSION" && !open && admission()) append(holder, h("p", { class: "form-error", style: "background:var(--warn-soft);color:var(--ink)", text: admission().notice }));
      append(holder, inquiryForm(type));
    }
    draw();
    var social = (s.showcase && s.showcase.socialLinks) || {};
    var socials = Object.keys(social).filter(function (key) { return safeHref(social[key]); });
    return [pageHead("Contact us", "Questions about the school or admission? Send us a message."),
      h("section", { class: "section", style: "padding-top:16px" }, h("div", { class: "container two-col" },
        h("div", { class: "panel" }, tabs, holder),
        h("div", { class: "stack" }, factsPanel(),
          socials.length ? h("div", { class: "panel" }, h("h3", { text: "Follow us" }), h("div", { class: "actions" }, socials.map(function (key) {
            return h("a", { class: "btn btn-ghost", href: social[key], target: "_blank", rel: "noopener noreferrer", text: label(key) });
          }))) : null)))];
  }

  // ── routing ─────────────────────────────────────────────────────────────
  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("?")[0].split("/").filter(Boolean);
    var section = parts[0] || "";
    var id = parts[1] || "";
    document.title = schoolName();
    setActive(section);
    closeMenus();
    switch (section) {
      case "": return render(homePage());
      case "about": return render(aboutPage());
      case "events": return render(id ? detailPage("events", id, "events", "All events", eventDetail) : listPage("events", "Events", "Programmes and activities at our school.", "No events have been published yet."));
      case "notices": return render(id ? detailPage("notices", id, "notices", "All notices", noticeDetail) : listPage("notices", "Notices", "Announcements from the school.", "There are no notices right now."));
      case "writings": return render(id ? detailPage("writings", id, "writings", "All writings", writingDetail) : listPage("writings", "Student writings", "Stories, poems and articles by our students.", "No writings have been published yet."));
      case "magazine": return render(id ? detailPage("magazines", id, "magazine", "All issues", magazineDetail) : listPage("magazines", "School magazine", "Every published issue of our school magazine.", "No magazine has been published yet."));
      case "gallery": return render(id ? detailPage("gallery", id, "gallery", "All albums", albumDetail) : listPage("gallery", "Gallery", "Moments from school life.", "No albums yet."));
      case "admission": return render(admissionPage());
      case "contact": return render(contactPage(id === "admission" ? "ADMISSION" : "GENERAL"));
      default: return render(h("div", { class: "container section" }, empty("Page not found."), h("p", { style: "text-align:center;margin-top:16px" }, link("", null, "Go to the home page"))));
    }
  }

  function setActive(section) {
    var map = { magazine: "school-life", events: "school-life", notices: "school-life", writings: "school-life", gallery: "school-life" };
    document.querySelectorAll("[data-nav]").forEach(function (el) {
      var key = el.getAttribute("data-nav");
      el.classList.toggle("active", key === section || key === map[section]);
    });
  }
  function closeMenus() {
    document.querySelectorAll(".dropdown.open").forEach(function (el) { el.classList.remove("open"); el.querySelector("button").setAttribute("aria-expanded", "false"); });
    var nav = document.getElementById("nav");
    nav.classList.remove("open");
    document.getElementById("nav-toggle").setAttribute("aria-expanded", "false");
  }

  function setupChrome() {
    document.querySelectorAll(".dropdown > button").forEach(function (button) {
      button.addEventListener("click", function (event) {
        event.stopPropagation();
        var box = button.parentElement;
        var open = !box.classList.contains("open");
        box.classList.toggle("open", open);
        button.setAttribute("aria-expanded", String(open));
      });
    });
    document.addEventListener("click", function (event) {
      if (!event.target.closest(".dropdown")) document.querySelectorAll(".dropdown.open").forEach(function (el) { el.classList.remove("open"); });
    });
    var toggle = document.getElementById("nav-toggle");
    toggle.addEventListener("click", function () {
      var nav = document.getElementById("nav");
      var open = !nav.classList.contains("open");
      nav.classList.toggle("open", open);
      toggle.setAttribute("aria-expanded", String(open));
    });
    window.addEventListener("hashchange", route);
  }

  function fillChrome() {
    var s = state.school || {};
    var brandLogo = document.getElementById("brand-logo");
    if (s.logoUrl) { brandLogo.src = s.logoUrl; brandLogo.alt = ""; brandLogo.hidden = false; }
    if (s.name) document.getElementById("brand-name").textContent = s.name;
    var open = admissionOpen();
    document.getElementById("nav-admission").classList.toggle("cta", open);
    var ribbon = document.getElementById("ribbon");
    ribbon.textContent = "";
    if (open) {
      append(ribbon, [admission().notice + " ", link("admission", null, "Apply now →")]);
      ribbon.hidden = false;
    } else {
      ribbon.hidden = true;
    }
    var footer = document.getElementById("footer-contact");
    footer.textContent = "";
    append(footer, [s.location ? h("li", { text: s.location }) : null,
      s.phone ? h("li", null, h("a", { href: "tel:" + String(s.phone).replace(/[^\d+]/g, ""), text: s.phone })) : null,
      s.email ? h("li", null, h("a", { href: "mailto:" + s.email, text: s.email })) : null]);
    document.getElementById("footer-name").textContent = s.name || "";
    var about = document.getElementById("footer-about");
    about.textContent = (s.showcase && (s.showcase.tagline || s.showcase.motto)) || "";
    document.getElementById("year").textContent = String(new Date().getFullYear());
    if (s.praavyoProfileUrl) document.getElementById("praavyo-link").href = s.praavyoProfileUrl;
  }

  setupChrome();
  render(loading());
  Promise.all([
    get("school").catch(function (error) { if (window.console) console.error("[school website] school profile:", error); return null; }),
    get("forms").catch(function (error) { if (window.console) console.error("[school website] forms:", error); return null; }),
    get("admission").catch(function () { return null; })
  ]).then(function (results) {
    state.school = results[0];
    state.forms = results[1];
    // Deadline and instructions for the admission page.
    state.season = results[2];
    if (!state.school) {
      render(h("div", { class: "container section" }, h("div", { class: "error-box", text: "The website could not connect to the school's data. If you manage this site, open api.php?path=school to see the error." })));
      return;
    }
    fillChrome();
    route();
  });
})();
`;
