import { A, useLocation, useNavigate } from "@solidjs/router";
import { Component, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot, query } from "firebase/firestore";
import { adminsCol, auth, waterRequestCol } from "../firebase";
import LogoDark from "../assets/images/perchfinder_logo_dark.png";
import LogoLight from "../assets/images/perchfinder_logo_light.png";

const PinIcon: Component = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s-6-4.8-6-10a6 6 0 1 1 12 0c0 5.2-6 10-6 10z" fill="none" />
        <circle cx="12" cy="11" r="2.2" fill="none" />
    </svg>
);

const HamburgerIcon: Component = () => (
    <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16" fill="none" />
        <path d="M4 12h16" fill="none" />
        <path d="M4 17h16" fill="none" />
    </svg>
);

const Navigation: Component = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser);
    const [isSigningOut, setIsSigningOut] = createSignal(false);
    const [isDesktopMenuOpen, setIsDesktopMenuOpen] = createSignal(false);
    const [isMobileMoreOpen, setIsMobileMoreOpen] = createSignal(false);
    const [pendingRequestCount, setPendingRequestCount] = createSignal(0);
    const [isAdminUser, setIsAdminUser] = createSignal(false);

    const toUserLabel = (displayName: string | null | undefined, email: string | null | undefined) => {
        const name = displayName?.trim();
        if (name) return name;
        if (!email) return "Användare";
        const [localPart] = email.split("@");
        return localPart || email;
    };
    onMount(() => {
        const unsub = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
        });
        onCleanup(() => unsub());
    });

    createEffect(() => {
        const user = currentUser();
        if (!user) {
            setIsAdminUser(false);
            return;
        }

        const adminRef = doc(adminsCol, user.uid);
        const unsub = onSnapshot(
            adminRef,
            (snap) => {
                setIsAdminUser(snap.exists());
            },
            (err) => {
                console.error("Kunde inte läsa admin-status", err);
                setIsAdminUser(false);
            }
        );

        onCleanup(() => unsub());
    });

    createEffect(() => {
        if (!isAdminUser()) {
            setPendingRequestCount(0);
            return;
        }

        const requestsQuery = query(waterRequestCol);
        const unsub = onSnapshot(
            requestsQuery,
            (snapshot) => {
                setPendingRequestCount(snapshot.size);
            },
            (err) => {
                console.error("Kunde inte hämta admin-förfrågningar", err);
                setPendingRequestCount(0);
            }
        );

        onCleanup(() => unsub());
    });

    createEffect(() => {
        if (location.pathname === undefined) return;
        setIsDesktopMenuOpen(false);
        setIsMobileMoreOpen(false);
    });

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            await signOut(auth);
            navigate("/");
        } catch (err) {
            console.error("Kunde inte logga ut", err);
        } finally {
            setIsSigningOut(false);
            setIsDesktopMenuOpen(false);
            setIsMobileMoreOpen(false);
        }
    };

    return (
        <>
            <nav class="main-nav">
                <div class="nav-header">
                    <A href="/" end class="nav-logo" onClick={() => setIsDesktopMenuOpen(false)}>
                        <img src={LogoDark} alt="Perch Finder" height={36} width={140} />
                    </A>
                    <button
                        type="button"
                        class="nav-toggle"
                        aria-expanded={isDesktopMenuOpen()}
                        aria-label="Visa meny"
                        onClick={() => setIsDesktopMenuOpen((open) => !open)}
                    >
                        <span />
                        <span />
                        <span />
                    </button>
                </div>
                <div class={`nav-links-group ${isDesktopMenuOpen() ? "is-open" : ""}`}>
                    <div class="nav-links">
                        <A href="/registrera-fiskevatten" onClick={() => setIsDesktopMenuOpen(false)}>Registrera vatten</A>
                        {currentUser() && (
                            <A href="/perchbuddy" onClick={() => setIsDesktopMenuOpen(false)}>PerchBuddy</A>
                        )}
                        {isAdminUser() && (
                            <A href="/admin/vattenforfragan" onClick={() => setIsDesktopMenuOpen(false)}>
                                Admin
                                <Show when={pendingRequestCount() > 0}>
                                    <span class="nav-badge">{pendingRequestCount()}</span>
                                </Show>
                            </A>
                        )}
                    </div>
                    {currentUser() ? (
                        <div class="nav-links nav-auth">
                            <A href="/profil" class="nav-user" onClick={() => setIsDesktopMenuOpen(false)}>
                                {toUserLabel(currentUser()?.displayName, currentUser()?.email)}
                            </A>
                            <button
                                type="button"
                                class="nav-button"
                                onClick={handleSignOut}
                                disabled={isSigningOut()}
                            >
                                {isSigningOut() ? "Loggar ut..." : "Logga ut"}
                            </button>
                        </div>
                    ) : (
                        <div class="nav-links nav-auth">
                            <A href="/logga-in" onClick={() => setIsDesktopMenuOpen(false)}>Logga in</A>
                            <A href="/skapa-konto" onClick={() => setIsDesktopMenuOpen(false)}>Skapa konto</A>
                        </div>
                    )}
                </div>
            </nav>
            <nav class="mobile-nav" aria-label="Mobilnavigering">
                <A href="/" end class="mobile-nav__item" aria-label="Karta">
                    <span class="mobile-nav__icon">
                        <PinIcon />
                    </span>
                </A>
                <Show
                    when={currentUser()}
                    fallback={
                        <A href="/logga-in" class="mobile-nav__item" aria-label="Logga in">
                            <span class="mobile-nav__icon">
                                <img src={LogoDark} alt="" />
                            </span>
                        </A>
                    }
                >
                    <A href="/perchbuddy" class="mobile-nav__item" aria-label="PerchBuddy">
                        <span class="mobile-nav__icon">
                            <img src={LogoLight} alt="" class="mobile-nav__logo--perchbuddy" />
                        </span>
                    </A>
                </Show>

                <div class={`mobile-nav__more ${isMobileMoreOpen() ? "is-open" : ""}`}>
                    <button
                        type="button"
                        class="mobile-nav__item mobile-nav__button"
                        aria-expanded={isMobileMoreOpen()}
                        aria-label="Visa fler val"
                        onClick={() => setIsMobileMoreOpen((open) => !open)}
                    >
                        <span class="mobile-nav__icon">
                            <HamburgerIcon />
                        </span>
                    </button>
                    <div class="mobile-nav__menu">
                        <A href="/registrera-fiskevatten" onClick={() => setIsMobileMoreOpen(false)}>
                            Registrera vatten
                        </A>
                        <Show when={isAdminUser()}>
                            <A href="/admin/vattenforfragan" onClick={() => setIsMobileMoreOpen(false)}>
                                Admin
                                <Show when={pendingRequestCount() > 0}>
                                    <span class="nav-badge">{pendingRequestCount()}</span>
                                </Show>
                            </A>
                        </Show>
                        <Show
                            when={currentUser()}
                            fallback={
                                <>
                                    <A href="/logga-in" onClick={() => setIsMobileMoreOpen(false)}>Logga in</A>
                                    <A href="/skapa-konto" onClick={() => setIsMobileMoreOpen(false)}>Skapa konto</A>
                                </>
                            }
                        >
                            <A href="/profil" onClick={() => setIsMobileMoreOpen(false)}>
                                {toUserLabel(currentUser()?.displayName, currentUser()?.email)}
                            </A>
                            <button
                                type="button"
                                class="mobile-nav__menu-button"
                                onClick={() => void handleSignOut()}
                                disabled={isSigningOut()}
                            >
                                {isSigningOut() ? "Loggar ut..." : "Logga ut"}
                            </button>
                        </Show>
                    </div>
                </div>
            </nav>
        </>
    )
}

export default Navigation
