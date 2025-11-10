# Fullstack Project

A modern full-stack web application built with Node.js, Express, and PostgreSQL, featuring server-side rendering with EJS templates and styled with Tailwind CSS.

> **⚠️ Disclaimer**: This project is created for educational and practice purposes only.

## 🚀 Tech Stack

### Backend
- **[Express.js](https://expressjs.com/) 5.1.0** - Fast, minimalist web framework for Node.js
- **[EJS](https://ejs.co/) 3.1.10** - Embedded JavaScript templating engine for server-side rendering
- **[express-ejs-layouts](https://github.com/Soarez/express-ejs-layouts) 2.5.1** - Layout support for EJS templates

### Database
- **[PostgreSQL](https://www.postgresql.org/)** - Powerful, open-source relational database
- **[Prisma ORM](https://www.prisma.io/) 6.19.0** - Next-generation ORM with type safety and intuitive data modeling
- **[pg](https://node-postgres.com/) 8.16.3** - PostgreSQL client for Node.js

### Frontend & Styling
- **[Tailwind CSS](https://tailwindcss.com/) 4.1.16** - Utility-first CSS framework for rapid UI development
- **[PostCSS](https://postcss.org/) 8.5.6** - Tool for transforming CSS with JavaScript
- **[Autoprefixer](https://github.com/postcss/autoprefixer) 10.4.21** - Automatically adds vendor prefixes to CSS

### Development Tools
- **[nodemon](https://nodemon.io/) 3.1.10** - Automatically restarts the server when file changes are detected
- **[concurrently](https://github.com/open-cli-tools/concurrently) 9.2.1** - Runs multiple commands concurrently (CSS watch + server)
- **[dotenv](https://github.com/motdotla/dotenv) 17.2.3** - Loads environment variables from `.env` file

## ✨ Features

- **Server-Side Rendering** - Dynamic HTML generation with EJS templates
- **PostgreSQL Database** - Robust relational database with Prisma ORM
- **Modern CSS Workflow** - Tailwind CSS with automatic compilation and hot reload
- **Development Hot Reload** - Automatic server restart and CSS rebuilding during development
- **Database Migrations** - Version-controlled database schema with Prisma Migrate
- **Production Ready** - Automated build and deployment scripts

## 🛠️ Development Workflow

The project uses a streamlined development setup with concurrent processes:

- **CSS Watch Mode** - Tailwind CSS automatically recompiles when styles change
- **Server Hot Reload** - nodemon restarts the Express server on code changes
- **Database Migrations** - Prisma handles schema changes and database updates
- **Automated Builds** - Post-install hooks ensure the app is ready to run