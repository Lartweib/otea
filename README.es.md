<div align="center">
  <p>
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="docs/images/otea-logo-dark.svg">
      <img src="docs/images/otea-logo-light.svg" alt="Otea" width="116" height="161">
    </picture>
  </p>
  <p>
    <a href="https://github.com/Lartweib/otea/actions/workflows/ci.yml"><img src="https://github.com/Lartweib/otea/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue" alt="Licencia: AGPL-3.0"></a>
    <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/node-%3E%3D22.18-339933" alt="Node &gt;=22.18"></a>
  </p>
</div>

# Otea · inicio rápido

> Del verbo *otear*: mirar desde lo alto lo que pasa y lo que viene.

**Otea es el lugar donde tú y tus agentes de IA se pasan el trabajo.** Los agentes dejan lo que hicieron, con su evidencia; tú dejas decisiones y comentarios. En cada momento se ve en qué está cada cosa y a quién le toca. Tus datos se quedan en tu proyecto: sin nube y sin cuentas.

Esta es la guía corta en español. Todo lo demás está en el [README en inglés](README.md).

## 1. Instalar

Todavía no hay descarga: Otea se instala desde el código. Necesitas Git y Node.js 22.18 o posterior (se recomienda Node 24).

```sh
git clone https://github.com/Lartweib/otea.git
cd otea
npm ci              # las dependencias del comando
npm run build:ui    # la página web que muestra otea serve
npm link            # deja el comando otea disponible en tu terminal
otea --version
```

`npm link` instala un comando de verdad, así que también lo encuentra la terminal de tu agente. Si `otea` no aparece, `npm prefix -g` te dice dónde quedó: agrega esa carpeta a tu PATH (en macOS y Linux, su `bin`). Para actualizar, corre `git pull`, `npm ci` y `npm run build:ui` otra vez.

## 2. Crear el proyecto

En la carpeta de tu proyecto:

```sh
otea init     # crea el proyecto y te dice el paso siguiente
```

## 3. Abrir el escritorio

```sh
otea serve    # abre el escritorio de Otea en tu navegador
```

Déjalo corriendo mientras trabajas. Es tu escritorio: ahí revisas, apruebas y devuelves el trabajo de tus agentes.

## 4. Pegarle el texto a tu agente

El escritorio vacío te muestra un texto bajo «Esto es para tu agente». Cópialo y pégalo en el chat de tu agente (Claude Code, OpenCode, Codex o cualquier otro con terminal o MCP). `otea prompt` imprime el mismo texto en la terminal.

Con ese texto, el agente se conecta solo, lee el proyecto y te hace unas preguntas para armar contigo sus tableros. Tú los pruebas y los publicas en Studio. Desde ahí, cada pedido pasa por un tablero, y tú revisas los pasos que el tablero te asigna.

Si trabajas directo en `main` y no quieres que nada se suba antes de verlo, pídele el tablero «Código en main». Al publicarlo, deja marcada la opción de instalar el hook de git de Otea (`otea hook install --git`): sin ese hook, git deja pasar un push antes de que lo apruebes.

## En Windows, con Git Bash

Git Bash convierte en ruta un argumento que empieza con `/`. Otea lo corrige en los textos que recibe (un título, un campo, una nota), así que `otea create --title "/deploy falla"` conserva su barra. En cualquier otro caso, pon `MSYS_NO_PATHCONV=1` delante de ese comando o empieza el valor con `//`.
