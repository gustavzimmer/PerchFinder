import { A, useNavigate } from "@solidjs/router";
import { Component, Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { doc, onSnapshot, query } from "firebase/firestore";
import { adminsCol, auth, waterRequestCol } from "../firebase";
import LogoDark from "../assets/images/perchfinder_logo_dark.png";

const Navigation: Component = () => {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = createSignal<User | null>(auth.currentUser);
    const [isSigningOut, setIsSigningOut] = createSignal(false);
    const [isMenuOpen, setIsMenuOpen] = createSignal(false);
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

    const handleSignOut = async () => {
        setIsSigningOut(true);
        try {
            await signOut(auth);
            navigate("/");
        } catch (err) {
            console.error("Kunde inte logga ut", err);
        } finally {
            setIsSigningOut(false);
            setIsMenuOpen(false);
        }
    };

    return (
            <nav class="main-nav">
                <div class="nav-header">
                    <A href="/" class="nav-logo" onClick={() => setIsMenuOpen(false)}>
                        <img src={LogoDark} alt="Perch Finder" height={36} width={140} />
                    </A>
                    <button
                        type="button"
                        class="nav-toggle"
                        aria-expanded={isMenuOpen()}
                        aria-label="Visa meny"
                        onClick={() => setIsMenuOpen((open) => !open)}
                    >
                        <span />
                        <span />
                        <span />
                    </button>
                </div>
                <div class={`nav-links-group ${isMenuOpen() ? "is-open" : ""}`}>
                    <div class="nav-links">
                        <A href="/registrera-fiskevatten" onClick={() => setIsMenuOpen(false)}>Registrera vatten</A>
                        {currentUser() && (
                            <A href="/daglig-tavling" onClick={() => setIsMenuOpen(false)}>PerchBuddy</A>
                        )}
                        {isAdminUser() && (
                            <A href="/admin/vattenforfragan" onClick={() => setIsMenuOpen(false)}>
                                Admin: Godkänn vatten
                                <Show when={pendingRequestCount() > 0}>
                                    <span class="nav-badge">{pendingRequestCount()}</span>
                                </Show>
                            </A>
                        )}
                    </div>
                    {currentUser() ? (
                        <div class="nav-links nav-auth">
                            <A href="/profil" class="nav-user" onClick={() => setIsMenuOpen(false)}>
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
                            <A href="/logga-in" onClick={() => setIsMenuOpen(false)}>Logga in</A>
                            <A href="/skapa-konto" onClick={() => setIsMenuOpen(false)}>Skapa konto</A>
                        </div>
                    )}
                </div>
            </nav>
    )
}

export default Navigation
