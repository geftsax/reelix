# Reelix

A video sharing web application built for COM769 coursework 2, running on Azure.

Creators publish short clips and set the details that go with them. Anyone can
sign up as a viewer to browse the newest uploads, search the catalogue, watch a
clip, comment on it and give it a rating.

## What it does

**Creator accounts** upload video and set the title, publisher, producer, genre
and age rating on every clip. There is no public sign-up page for creators; an
administrator enrols them.

**Viewer accounts** are open to anyone. A viewer can browse, search, play,
comment and rate, but cannot upload.

**The dashboard** shows the latest clips, with search and filters over the
catalogue.

## How it is put together

The front end is static HTML, CSS and JavaScript served from Azure Blob Storage
static website hosting. It talks to the backend over REST.

The backend is a REST API in Node and Express on Azure App Service. It holds the
service logic and the connections to storage.

Data is split between two stores: Azure SQL Database for accounts, clips,
comments and ratings, and Azure Blob Storage for the video files themselves.

Users and roles are handled with JSON Web Tokens, and every role check is made on
the server.

Comments are screened by Azure AI Content Safety before they are stored.

Responses that are read often are cached, and each tier can be scaled without
touching the others.

## Running it locally

```
cd api
npm install
npm start
```

The API listens on http://localhost:8080. With no database connection string it
falls back to a local file store, so it runs without any Azure resources.

Serve the front end:

```
node scripts/serve-web.js
```

Run the tests:

```
cd api
npm test
```

## Layout

```
api/     the REST API and its tests
web/     the static front end
infra/   the Azure resources, as Bicep
scripts/ set up the database, seed it, check a deployment
```

## Settings

Everything is read from environment variables, listed in `api/.env.example`.
The same code runs locally and on Azure.
