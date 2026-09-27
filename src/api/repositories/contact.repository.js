import { Contact } from '../models/index.js';
import { lerNumerosDaLatta } from '../../utils/numeroDoPublico.js';
import { colunaDoAtendimento, numeroDaRespostaDoPainel } from '../../utils/conversaPorNumero.js';

// O atendimento humano vale por CONVERSA (pessoa e número da Latta). A operadora
// que assume a conversa de uma clínica no número do estabelecimento não pode
// calar a Latta para a mesma pessoa no número do tutor. `numero` ausente é a
// conversa do número do tutor, a única que existia antes do segundo número.
const conversaDoAtendimento = (numero) => {
  const n = lerNumerosDaLatta();
  const conversa = numeroDaRespostaDoPainel(numero, n);
  return { ...conversa, coluna: colunaDoAtendimento(conversa.numero, n) };
};

const toggleAttendance = async ({ contact_id, numero = null }) => {
  try {
    const { numero: daConversa, coluna } = conversaDoAtendimento(numero);
    const contact = await Contact.findByPk(contact_id);

    if (!contact) {
      throw new Error('Contact not found');
    }

    contact[coluna] = !contact[coluna];
    await contact.save();

    return {
      id: contact.id,
      business_phone_number_id: daConversa,
      is_being_attended: contact[coluna] === true,
    };
  } catch (error) {
    if (error?.status === 400) throw error;
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Set explicit (no toggle) — usado quando Luma envia mensagem/template pelo
// painel: o ato de envio força is_being_attended=true, evitando que a Lattinha
// (bot) responda a próxima inbound do tutor.
const setAttendance = async ({ contact_id, is_being_attended, numero = null }) => {
  try {
    const { numero: daConversa, coluna } = conversaDoAtendimento(numero);
    const contact = await Contact.findByPk(contact_id);

    if (!contact) {
      throw new Error('Contact not found');
    }

    contact[coluna] = !!is_being_attended;
    await contact.save();

    return {
      id: contact.id,
      business_phone_number_id: daConversa,
      is_being_attended: contact[coluna] === true,
    };
  } catch (error) {
    if (error?.status === 400) throw error;
    throw new Error(`Repository error: ${error.message}`);
  }
};

// Migrado do webhook N8n /responsability na Fase 4. Define quem está
// "no comando" da conversa: 'latta' (bot), 'petshop' (operador humano)
// ou outro path custom. Usado pelo dropdown "Trocar responsável" no
// painel de mensageria.
const setResponsibility = async ({ contact_id, user_id, path }) => {
  try {
    const contact = await Contact.findByPk(contact_id);
    if (!contact) {
      throw new Error('Contact not found');
    }
    contact.path = path || null;
    contact.user_id = user_id || null;
    await contact.save();
    return {
      id: contact.id,
      cellphone: contact.cellphone,
      path: contact.path,
      user_id: contact.user_id,
    };
  } catch (error) {
    throw new Error(`Repository error: ${error.message}`);
  }
};

export default {
  toggleAttendance,
  setAttendance,
  setResponsibility,
};
