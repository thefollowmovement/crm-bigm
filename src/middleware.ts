import { NextResponse, type NextRequest } from "next/server";

// Garde OPTIMISTE uniquement : présence du cookie de session.
// La vérification autoritaire (session valide, utilisateur actif, permissions)
// est faite côté serveur par requireUser() / safeAction.
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has("session");
  const { pathname } = request.nextUrl;

  if (!hasSession && pathname !== "/connexion") {
    const url = request.nextUrl.clone();
    url.pathname = "/connexion";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (hasSession && pathname === "/connexion") {
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
