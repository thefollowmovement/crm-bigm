/* eslint-disable @next/next/no-img-element --
   Images statiques WebP déjà redimensionnées/compressées à la main :
   l'optimiseur next/image n'apporterait rien et complique le mode standalone. */
import type { Metadata } from "next";
import Link from "next/link";

import { VitrineReveal } from "./reveal";
import "./vitrine.css";

// Vitrine publique « 321 Chicken » (étape 45) : servie aux visiteurs
// anonymes sur / via un rewrite du middleware. Elle raconte une légende
// loufoque du poulet et masque totalement le CRM ; le seul chemin vers la
// connexion est le lien discret « La recette secrète » du pied de page.
export const metadata: Metadata = {
  title: { absolute: "321 Chicken — La légende du poulet" },
  description:
    "3… 2… 1… Poulet. La légende (presque vraie) de Raymond, le poulet le plus déterminé de l'histoire de la volaille.",
};

const MARQUEE = Array(4).fill(
  "321 Chicken • Le poulet légendaire • 3… 2… 1… Croustillant •"
);

export default function VitrinePage() {
  return (
    <div className="v-root">
      <VitrineReveal />

      {/* ------------------------------------------------ Héros */}
      <header className="v-hero">
        <span className="v-float" style={{ top: "14%", left: "8%" }} aria-hidden>
          🐔
        </span>
        <span
          className="v-float"
          style={{ top: "22%", right: "10%", animationDelay: "1.4s" }}
          aria-hidden
        >
          🍗
        </span>
        <span
          className="v-float"
          style={{ bottom: "18%", left: "14%", animationDelay: "2.6s" }}
          aria-hidden
        >
          🪶
        </span>
        <div>
          <span className="v-hero-badge v-rv v-rv-pop">
            Une légende 100 % authentique*&nbsp;&nbsp;·&nbsp;&nbsp;*ou presque
          </span>
          <h1 className="v-title v-sticker v-rv" style={{ "--d": "0.1s" } as React.CSSProperties} data-testid="vitrine-title">
            321 Chicken
          </h1>
          <p className="v-rv" style={{ "--d": "0.25s" } as React.CSSProperties}>
            La légende du poulet qui ne recule jamais. 3… 2… 1… POULET.
          </p>
          <a
            className="v-hero-cta v-rv"
            style={{ "--d": "0.4s" } as React.CSSProperties}
            href="#chapitre-3"
          >
            Découvrir la légende ↓
          </a>
        </div>
      </header>

      {/* ------------------------------------------------ Bandeau */}
      <div className="v-marquee" aria-hidden>
        <div className="v-marquee-track">
          {MARQUEE.map((text, i) => (
            <span key={i}>{text}</span>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------ Chapitre 3 */}
      <section id="chapitre-3" className="v-chapter">
        <div className="v-chapter-media v-rv v-rv-left">
          <img
            src="/vitrine/poussin.webp"
            alt="Raymond, poussin au bandana rouge, quittant sa ferme à l'aube"
            width={1000}
            height={1000}
            loading="lazy"
          />
        </div>
        <div>
          <span className="v-count v-rv" aria-hidden>
            3
          </span>
          <h2 className="v-rv" style={{ "--d": "0.1s" } as React.CSSProperties}>
            Un poussin nommé Raymond
          </h2>
          <p className="v-rv" style={{ "--d": "0.2s" } as React.CSSProperties}>
            Tout commence à Perpète-les-Volailles, un village si petit que le
            panneau d&apos;entrée est aussi celui de sortie. Un matin, Raymond,
            poussin de 43 grammes tout mouillé, enfile un bandana rouge, vole
            le sac à dos de son grand frère et annonce à la basse-cour
            médusée&nbsp;: <strong>«&nbsp;Je serai le plus grand poulet de
            tous les temps.&nbsp;»</strong> Personne n&apos;y croit. Surtout
            pas les canards, mais les canards ne croient jamais en rien.
          </p>
        </div>
      </section>

      <div className="v-speedlines" aria-hidden />

      {/* ------------------------------------------------ Chapitre 2 */}
      <div className="v-bg-sky">
        <section className="v-chapter v-flip">
          <div className="v-chapter-media v-rv v-rv-right">
            <img
              src="/vitrine/dojo.webp"
              alt="Raymond en kimono s'entraînant sous une cascade devant Maître Gérard-san"
              width={1000}
              height={1000}
              loading="lazy"
            />
          </div>
          <div>
            <span
              className="v-count v-rv"
              style={{ "--v-count-color": "var(--v-violet)" } as React.CSSProperties}
              aria-hidden
            >
              2
            </span>
            <h2 className="v-rv" style={{ "--d": "0.1s" } as React.CSSProperties}>
              Le dojo de Maître Gérard-san
            </h2>
            <p className="v-rv" style={{ "--d": "0.2s" } as React.CSSProperties}>
              Sept ans d&apos;entraînement dans la montagne, sous une cascade
              glacée, aux côtés de <strong>Maître Gérard-san</strong>, vieux
              coq aux sourcils si longs qu&apos;il se prend dedans quand il
              éternue. Raymond y apprend la patience, l&apos;équilibre sur une
              patte, et surtout la technique interdite du{" "}
              <strong>«&nbsp;Compte à rebours croustillant&nbsp;»</strong>&nbsp;:
              3… 2… 1… et plus rien ne résiste. Pas même le gravier.
            </p>
          </div>
        </section>
      </div>

      <div className="v-speedlines" aria-hidden />

      {/* ------------------------------------------------ Chapitre 1 */}
      <div className="v-bg-night">
        <section className="v-chapter">
          <div className="v-chapter-media v-rv v-rv-left">
            <img
              src="/vitrine/chef.webp"
              alt="Raymond en chef cuisinier faisant flamber un burger dans une rue néon"
              width={1000}
              height={1000}
              loading="lazy"
            />
          </div>
          <div>
            <span
              className="v-count v-rv"
              style={{ "--v-count-color": "var(--v-orange)" } as React.CSSProperties}
              aria-hidden
            >
              1
            </span>
            <h2 className="v-rv" style={{ "--d": "0.1s" } as React.CSSProperties}>
              Le maître des flammes
            </h2>
            <p className="v-rv" style={{ "--d": "0.2s" } as React.CSSProperties}>
              À Tokyo, sous les néons, Raymond devient chef. Sa spécialité fait
              trembler les guides gastronomiques&nbsp;: le burger flambé à la
              seconde près. Les clients pleurent de joie, les critiques rendent
              leurs étoiles pour en réclamer de nouvelles, et une question
              hante la profession&nbsp;: <strong>comment un poulet peut-il
              cuisiner du poulet&nbsp;?</strong> Raymond répond toujours la
              même chose&nbsp;: «&nbsp;Je ne cuisine pas le poulet. Je cuisine
              la légende.&nbsp;»
            </p>
          </div>
        </section>
      </div>

      <div className="v-speedlines" aria-hidden />

      {/* ------------------------------------------------ Chapitre 0 */}
      <div className="v-bg-fete">
        <section className="v-chapter v-flip">
          <div className="v-chapter-media v-rv v-rv-right">
            <img
              src="/vitrine/fete.webp"
              alt="Une foule de poulets en fête portant Raymond en triomphe sous les feux d'artifice"
              width={1400}
              height={782}
              loading="lazy"
            />
          </div>
          <div>
            <span
              className="v-count v-rv"
              style={{ "--v-count-color": "var(--v-teal)" } as React.CSSProperties}
              aria-hidden
            >
              0
            </span>
            <h2 className="v-rv" style={{ "--d": "0.1s" } as React.CSSProperties}>
              3, 2, 1… la fête !
            </h2>
            <p className="v-rv" style={{ "--d": "0.2s" } as React.CSSProperties}>
              De retour à Perpète-les-Volailles, Raymond est porté en triomphe
              par tout le poulailler — même les canards applaudissent, c&apos;est
              dire. Depuis, chaque soir de pleine lune, les poulets du monde
              entier comptent à rebours avant de se coucher. En son honneur.{" "}
              <strong>3… 2… 1… Chicken.</strong> La légende ne fait que
              commencer.
            </p>
          </div>
        </section>
      </div>

      {/* ------------------------------------------------ Chiffres */}
      <section className="v-stats">
        <div className="v-stat v-rv">
          <b>9 999</b>
          <span>grains de maïs engloutis par jour d&apos;entraînement</span>
        </div>
        <div className="v-stat v-rv" style={{ "--d": "0.12s" } as React.CSSProperties}>
          <b>100&nbsp;%</b>
          <span>croustillant, 0&nbsp;% excuse — devise officielle du dojo</span>
        </div>
        <div className="v-stat v-rv" style={{ "--d": "0.24s" } as React.CSSProperties}>
          <b>3 sec</b>
          <span>le temps qu&apos;il faut à une légende pour décoller</span>
        </div>
      </section>

      {/* ------------------------------------------------ Pied de page */}
      <footer className="v-footer">
        <div className="v-footer-logo">321 Chicken</div>
        <ul className="v-footer-links">
          <li>
            <a href="#chapitre-3">La légende</a>
          </li>
          <li>
            <a href="mailto:bonjour@321chicken.cloud">Nous écrire</a>
          </li>
          <li>
            {/* Lien discret vers la connexion du CRM — texte volontairement
                anodin, fondu parmi les autres liens du pied de page. */}
            <Link href="/connexion">La recette secrète</Link>
          </li>
        </ul>
        <small>
          © {new Date().getFullYear()} 321 Chicken — Tous droits réservés.
          Aucun poulet n&apos;a été contrarié durant l&apos;écriture de cette
          légende.
        </small>
      </footer>
    </div>
  );
}
