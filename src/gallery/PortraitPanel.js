import './portrait-panel.css'

const bios = {
	machado: ['Um dos maiores nomes da literatura brasileira', 'Autor de Dom Casmurro, Quincas Borba e Memórias Póstumas de Brás Cubas, renovou o romance brasileiro com sua ironia e sua crítica à elite escravista. Ajudou a fundar a Academia Brasileira de Letras e foi seu primeiro presidente.'],
	aleijadinho: ['Mestre do barroco brasileiro', 'Antônio Francisco Lisboa era filho de Isabel, uma mulher escravizada, e de um arquiteto português. Esculpiu em pedra-sabão os Doze Profetas de Congonhas, uma das obras mais conhecidas da arte colonial brasileira.'],
	reboucas: ['Referência da engenharia e do abolicionismo no Império', 'Projetou o armazém das Docas D. Pedro II, parte da modernização do porto do Rio de Janeiro. Engenheiro negro e abolicionista, defendeu o acesso à terra para que a liberdade viesse acompanhada de meios de sustento.'],
	adhemar: ['Primeiro bicampeão olímpico do Brasil', 'Venceu o salto triplo em Helsinque (1952) e Melbourne (1956). Seu primeiro título foi também o primeiro ouro olímpico do atletismo brasileiro. Estabeleceu cinco recordes mundiais na prova.'],
	luizgama: ['Um dos principais líderes do abolicionismo brasileiro', 'Vendido como escravizado aos dez anos, recuperou a própria liberdade e passou a defender nos tribunais pessoas mantidas ilegalmente em cativeiro. Em Primeiras Trovas Burlescas, usou a sátira para atacar a elite escravista.'],
	pixinguinha: ['Mestre do choro e da música popular brasileira', 'Compôs Carinhoso e Lamentos. Como flautista dos Oito Batutas, apresentou a música brasileira em Paris em 1922. Seus arranjos para discos e rádio marcaram a música popular do país.'],
	gloria: ['Ícone do telejornalismo brasileiro', 'Em 1977, fez a primeira entrada ao vivo em cores do Jornal Nacional, na Avenida Brasil, no Rio. Apresentou o Fantástico e se tornou uma das repórteres mais reconhecidas do país, abrindo espaço para gerações de jornalistas negras.'],
	milton: ['Referência mundial da geografia', 'Recebeu em 1994 o Prêmio Vautrin Lud, uma das maiores distinções da geografia. Em Por uma outra globalização, mostrou como os ganhos da integração mundial se distribuem de forma desigual e defendeu alternativas.'],
	nilo: ['Presidente que lançou as bases da rede federal de ensino técnico', 'Na Presidência, em 1909, criou 19 Escolas de Aprendizes Artífices, que ofereciam formação profissional gratuita. Essas escolas deram origem à rede que hoje inclui os institutos federais.'],
	pele: ['Rei do Futebol', 'Pelé é o único jogador a vencer três Copas do Mundo masculinas (1958, 1962 e 1970). Aos 17 anos, fez dois gols na final do primeiro título mundial do Brasil. Com o Santos, também foi bicampeão da Libertadores e do Mundial Interclubes.'],
}

const storageKey = 'legado:quadros-do-corredor'

export function mountPortraitPanel(tour, edit) {
	const brand = document.querySelector('.brand small')
	brand.textContent = 'Galeria de Histórias da FANS'
	document.body.classList.add('portrait-tour')
	const bio = document.createElement('section')
	bio.className = 'portrait-bio'
	bio.setAttribute('aria-label', 'Sobre a pessoa retratada')
	bio.innerHTML = '<h2></h2><p class="portrait-title"></p><p></p>'
	document.querySelector('.topbar').append(bio)
	const [name, title, description] = bio.children
	tour.onSubject = character => {
		name.textContent = character.name
		;[title.textContent, description.textContent] = bios[character.id]
	}
	tour.onSubject(tour.sets.entries[0].character)

	try {
		const saved = JSON.parse(localStorage.getItem(storageKey))
		tour.sharedPlacement = saved?.shared ?? saved?.machado ?? {}
	} catch {}
	if (!edit) return

	const panel = document.createElement('section')
	panel.className = 'portrait-editor'
	panel.setAttribute('aria-label', 'Editar quadros')
	panel.innerHTML = `
		<h2>Ajustar todos os quadros</h2>
		<label>Pessoa <select name="subject"></select></label>
		<label>Horizontal <input name="offset" type="range" min="-.6" max=".6" step=".01"></label>
		<label>Altura <input name="height" type="range" min="2.85" max="4.45" step=".01"></label>
		<label>Tamanho <input name="scale" type="range" min=".65" max="1.2" step=".01"></label>
		<div class="portrait-editor-actions">
			<button type="button" data-reset>Restaurar</button>
			<button type="button" data-save>Salvar quadros</button>
		</div>
		<output aria-live="polite"></output>`
	const select = panel.querySelector('select')
	const inputs = [...panel.querySelectorAll('input')]
	const status = panel.querySelector('output')
	for (const { character } of tour.sets.entries) select.add(new Option(character.name, character.id))
	function selectSubject() {
		tour.selectPortrait(select.selectedIndex)
		const placement = tour.placement()
		for (const input of inputs) input.value = placement[input.name]
		status.textContent = ''
	}
	panel.addEventListener('input', event => {
		if (event.target === select) {
			selectSubject()
			return
		}
		tour.sharedPlacement = Object.fromEntries(inputs.map(input => [input.name, input.valueAsNumber]))
		status.textContent = 'Alterações pendentes'
	})
	panel.querySelector('[data-reset]').onclick = () => {
		tour.sharedPlacement = {}
		selectSubject()
		status.textContent = 'Padrão restaurado. Salve para aplicar.'
	}
	panel.querySelector('[data-save]').onclick = () => {
		try {
			localStorage.setItem(storageKey, JSON.stringify({ shared: tour.sharedPlacement }))
			status.textContent = 'Quadros salvos neste navegador.'
		} catch {
			status.textContent = 'O navegador bloqueou o salvamento.'
		}
	}
	document.body.append(panel)
	selectSubject()
}
