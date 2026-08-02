// CMS content schema, defaults, and seed data.
// The admin panel renders its forms from SCHEMA, and the worker uses DEFAULTS
// as the starting point until the admin saves changes to KV.

export const SECTIONS = ["home", "profile", "blog", "site"];

export const SCHEMA = {
  sections: {
    home: {
      label: "Home Page",
      fields: [
        { key: "hero.title", label: "Hero title", type: "text" },
        { key: "hero.tagline", label: "Hero tagline", type: "text" },
        { key: "about.heading", label: "About heading", type: "text" },
        { key: "about.body", label: "About text", type: "textarea" },
        { key: "latest.heading", label: "Latest posts heading", type: "text" },
      ],
    },
    profile: {
      label: "Profile Page",
      fields: [
        { key: "hero.title", label: "Page title", type: "text" },
        { key: "hero.lead", label: "Page intro", type: "textarea" },
        { key: "avatar", label: "Avatar initials", type: "text" },
        { key: "name", label: "Your name", type: "text" },
        { key: "role", label: "Role / title", type: "text" },
        { key: "location", label: "Location", type: "text" },
        { key: "links.github", label: "GitHub URL", type: "link", linkLabel: "GitHub" },
        { key: "links.linkedin", label: "LinkedIn URL", type: "link", linkLabel: "LinkedIn" },
        { key: "links.twitter", label: "Twitter / X URL", type: "link", linkLabel: "Twitter / X" },
        { key: "links.email", label: "Email address", type: "link", linkLabel: "Email", mailto: true },
        { key: "about.heading", label: "About heading", type: "text" },
        { key: "about.body", label: "About text (HTML allowed)", type: "html" },
        { key: "whatIDo.heading", label: "What I Do heading", type: "text" },
        { key: "area1.title", label: "Area 1 title", type: "text" },
        { key: "area1.body", label: "Area 1 description", type: "textarea" },
        { key: "area2.title", label: "Area 2 title", type: "text" },
        { key: "area2.body", label: "Area 2 description", type: "textarea" },
        { key: "area3.title", label: "Area 3 title", type: "text" },
        { key: "area3.body", label: "Area 3 description", type: "textarea" },
        { key: "experience.heading", label: "Experience heading", type: "text" },
        { key: "exp1.role", label: "Role 1", type: "text" },
        { key: "exp1.period", label: "Period 1", type: "text" },
        { key: "exp1.body", label: "Role 1 description", type: "textarea" },
        { key: "exp2.role", label: "Role 2", type: "text" },
        { key: "exp2.period", label: "Period 2", type: "text" },
        { key: "exp2.body", label: "Role 2 description", type: "textarea" },
        { key: "contact.heading", label: "Contact heading", type: "text" },
        { key: "contact.body", label: "Contact text (HTML allowed)", type: "html" },
      ],
    },
    blog: {
      label: "Blog Page",
      fields: [
        { key: "hero.title", label: "Page title", type: "text" },
        { key: "hero.lead", label: "Page intro", type: "textarea" },
      ],
    },
    site: {
      label: "Site-wide",
      fields: [
        { key: "brand", label: "Site name (header)", type: "text" },
        { key: "footer.text", label: "Footer text (HTML allowed)", type: "html" },
        { key: "footer.links", label: "Footer links (HTML allowed)", type: "html" },
      ],
    },
  },
};

export const DEFAULTS = {
  home: {
    "hero.title": "Welcome to 57\u2019s own website!",
    "hero.tagline": "57 is a composite number, which equals 3 times 19.",
    "about.heading": "About Me",
    "about.body": "57 consonants with the admin's Chinese name,like which his classmates always call him.",
    "latest.heading": "Latest from the Blog",
  },
  profile: {
    "hero.title": "Profile",
    "hero.lead": "A little about me, what I do, and what I value.",
    "avatar": "YN",
    "name": "[Your Name]",
    "role": "Role / Title \u2014 e.g. Developer, Designer, Writer",
    "location": "\ud83d\udccd City, Country",
    "links.github": "#",
    "links.linkedin": "#",
    "links.twitter": "#",
    "links.email": "you@example.com",
    "about.heading": "About Me",
    "about.body": "<p>Write a few paragraphs about yourself here. Your background, what you are working on now, and what excites you. Keep it genuine \u2014 this is the page people read before deciding to reach out.</p>\n<p>You can add more paragraphs, photos, or embedded content later. The layout is designed to grow with you.</p>",
    "whatIDo.heading": "What I Do",
    "area1.title": "Area 1",
    "area1.body": "Short description of your first specialty or interest.",
    "area2.title": "Area 2",
    "area2.body": "Short description of your second specialty or interest.",
    "area3.title": "Area 3",
    "area3.body": "Short description of your third specialty or interest.",
    "experience.heading": "Experience",
    "exp1.role": "Role at Company",
    "exp1.period": "2023 \u2014 Present",
    "exp1.body": "What you did and what you achieved in this role.",
    "exp2.role": "Earlier Role",
    "exp2.period": "2020 \u2014 2023",
    "exp2.body": "Another chapter of your story.",
    "contact.heading": "Contact",
    "contact.body": "<p>Want to get in touch? Drop me a line at <a class=\"text-link\" href=\"mailto:you@example.com\">you@example.com</a>.</p>",
  },
  blog: {
    "hero.title": "Blog",
    "hero.lead": "Notes, ideas, and stories. New posts whenever I have something worth saying.",
  },
  site: {
    "brand": "57\u2019s own website",
    "footer.text": "&copy; <span id=\"year\"></span> 57&rsquo;s own website. Built with care.",
    "footer.links": "<a href=\"#\">GitHub</a> \u00b7 <a href=\"#\">Twitter / X</a> \u00b7 <a href=\"mailto:you@example.com\">Email</a>",
  },
};

export const DEFAULT_POSTS = {
  welcome: {
    slug: "welcome",
    title: "Welcome to my new site",
    date: "Aug 2, 2026",
    readMinutes: "2",
    excerpt: "Your first post lives here. Replace this placeholder with a real introduction to your site and what you plan to write about.",
    body: "<p>This is your first post. It is a placeholder that shows you how posts are structured \u2014 everything from headings and links to code blocks.</p>\n<h2>How posts work</h2>\n<p>Every post is a simple HTML file inside the <code>posts/</code> folder. To publish something new:</p>\n<ol>\n<li>Copy this file and give it a new name.</li>\n<li>Rewrite the content with your own words.</li>\n<li>Add a card for it on <a href=\"../blog.html\">the blog page</a>.</li>\n</ol>\n<blockquote>A quote looks like this. Use it for a memorable line or an important idea.</blockquote>\n<h2>Code blocks</h2>\n<p>If you write about code, it is easy to show it:</p>\n<pre><code>const hello = () => console.log(\"Hello, world!\");</code></pre>\n<h2>What&rsquo;s next</h2>\n<p>Write about what you know, what you are learning, or what you find interesting. The best blog starts with one honest post \u2014 and you already have this one.</p>",
    published: true,
  },
};
