import { A } from "@solidjs/router"

const Navigation = () => {

    return (
            <nav class="main-nav">
                <div class="nav-links">
                    <A href="/">Hem</A>
                    <A href="/registrera-fiskevatten">Registrera vatten</A>
                </div>
                <div class="nav-links">
                    <A href="/logga-in">Logga in</A>
                    <A href="/skapa-konto">Skapa konto</A>
                </div>
            </nav>
    )
}

export default Navigation
