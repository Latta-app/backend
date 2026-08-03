import CoinsService from '../services/coins.service.js';

// Painel de lattinhas — controller de LEITURA.
// Ref: docs/issues/painel-lattinhas/issues/02-* (repo Latta).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getByPetOwner = async (req, res) => {
  const { petOwnerId } = req.params;

  // Sem isto, um `petOwnerId` malformado vira erro de cast do Postgres (22P02)
  // e sai como 500 — que o painel leria como "o backend caiu", não "esse id não
  // é um tutor". Mesmo pedágio que o `template_id` uuid já cobrou na mensageria.
  if (!UUID_RE.test(String(petOwnerId ?? ''))) {
    return res.status(400).json({ message: 'petOwnerId inválido' });
  }

  try {
    const data = await CoinsService.getByPetOwner(petOwnerId, {
      limit: req.query.limit,
      offset: req.query.offset,
    });
    return res.status(200).json(data);
  } catch (error) {
    if (error?.status === 404) {
      return res.status(404).json({ message: 'Tutor não encontrado' });
    }
    console.error('[coins.controller] getByPetOwner:', error);
    return res.status(500).json({ message: 'Erro ao buscar lattinhas do tutor' });
  }
};

export default { getByPetOwner };
