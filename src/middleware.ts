import { NextResponse, type NextRequest } from "next/server";

// Garde OPTIMISTE uniquement : présence du cookie de session.
// La vérification autoritaire (session valide, utilisateur actif, permissions)
// est faite côté serveur par requireUser() / safeAction.
//
// Depuis l'étape 45, l'application est masquée derrière un site vitrine
// public : un visiteur sans cookie voit la vitrine « 321 Chicken » sur /
// (rewrite interne, l'URL ne change pas) et toute autre URL le ramène à la
// vitrine SANS jamais révéler /connexion. La page de connexion reste
// accessible directement — son lien est caché dans le pied de page de la
// vitrine (« La recette secrète »).
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has("session");
  const { pathname } = request.nextUrl;

  if (!hasSession) {
    if (pathname === "/") {
      const url = request.nextUrl.clone();
      url.pathname = "/vitrine";
      return NextResponse.rewrite(url);
    }
    if (
      pathname === "/vitrine" ||
      pathname === "/connexion" ||
      // Formulaire public de transmission comptable par lien à usage unique
      // (étape 49) : la validité du jeton est vérifiée par la page elle-même.
      pathname.startsWith("/transmission/")
    ) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (pathname === "/connexion") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Tout sauf les assets Next, les fichiers statiques et les routes API :
  // les API (/api/files, /api/health…) gèrent leur propre authentification
  // et doivent répondre 401, pas rediriger.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/|.*\\..*).*)"],
};
