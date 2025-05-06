import SchedulingRepository from '../repositories/scheduling.repository.js';
import { sequelize } from '../../config/database.js';
import { DateTime } from 'luxon';

// Função para gerar agendamentos recorrentes
const generateRecurrentSchedulings = (scheduling) => {
  const recurrentSchedulings = [];

  // Se não for recorrente, retorna apenas o agendamento original
  if (!scheduling.frequency || scheduling.frequency.type === 'no_repeat') {
    return [scheduling];
  }

  // Extrair informações de frequência e condição de término
  const { frequency, endCondition } = scheduling;

  // Converter as strings de data para objetos DateTime do Luxon
  const baseDate = DateTime.fromISO(scheduling.appointment_date);
  const baseStartTime = DateTime.fromSQL(scheduling.start_time);
  const baseEndTime = DateTime.fromSQL(scheduling.end_time);

  // Calcular data final com base na condição de término
  let endDate = baseDate;
  if (endCondition.type === 'after') {
    if (endCondition.interval.value === 'weeks') {
      endDate = baseDate.plus({ weeks: endCondition.value });
    } else if (endCondition.interval.value === 'months') {
      endDate = baseDate.plus({ months: endCondition.value });
    } else {
      // days
      endDate = baseDate.plus({ days: endCondition.value });
    }
  } else if (endCondition.type === 'on_date') {
    endDate = DateTime.fromISO(endCondition.value);
  } else {
    // never
    // Definir um limite razoável, por exemplo, 1 ano
    endDate = baseDate.plus({ years: 1 });
  }

  // Adicionar o agendamento original
  recurrentSchedulings.push({ ...scheduling });

  // Calcular datas recorrentes
  let currentDate = baseDate;
  let occurrenceCount = 1; // Já contamos o original

  // Definir limite máximo de segurança para número de agendamentos
  const MAX_RECURRENT_SCHEDULINGS = 50;

  while (true) {
    // Calcular próxima data com base na frequência
    if (frequency.interval.value === 'weeks') {
      currentDate = currentDate.plus({ weeks: frequency.value });
    } else if (frequency.interval.value === 'months') {
      currentDate = currentDate.plus({ months: frequency.value });
    } else {
      // days
      currentDate = currentDate.plus({ days: frequency.value });
    }

    // Verificar limitadores
    // 1. Atingiu o número máximo de ocorrências específicas
    if (endCondition.type === 'after' && occurrenceCount >= endCondition.value) {
      break;
    }

    // 2. Ultrapassou a data final
    if (currentDate > endDate) {
      break;
    }

    // 3. Atingiu o limite de segurança
    if (recurrentSchedulings.length >= MAX_RECURRENT_SCHEDULINGS) {
      console.warn(
        `Safety limit of ${MAX_RECURRENT_SCHEDULINGS} recurring schedulings reached. Some future occurrences were not created.`,
      );
      break;
    }

    // Calcular diferença em dias entre a data original e a atual
    const diffInDays = currentDate.diff(baseDate, 'days').days;

    // Criar novo agendamento para a data atual
    const newScheduling = { ...scheduling };
    const newDateStr = currentDate.toISODate(); // Formato YYYY-MM-DD

    // Atualizar datas do novo agendamento
    newScheduling.appointment_date = newDateStr;

    // Ajustar os horários de início e término mantendo a mesma hora do dia
    const newStartTime = baseStartTime.plus({ days: diffInDays });
    const newEndTime = baseEndTime.plus({ days: diffInDays });

    newScheduling.start_time = newStartTime.toSQL({ includeOffset: false }).substring(0, 19);
    newScheduling.end_time = newEndTime.toSQL({ includeOffset: false }).substring(0, 19);

    // Adicionar ao array de agendamentos recorrentes
    recurrentSchedulings.push(newScheduling);
    occurrenceCount++;
  }

  return recurrentSchedulings;
};

const createScheduling = async ({ schedulingData }) => {
  let transaction;

  try {
    // Verificar se schedulingData é um array válido
    if (!Array.isArray(schedulingData) || schedulingData.length === 0) {
      throw new Error('Invalid schedulings data: must be a non-empty array');
    }

    // Processar agendamentos recorrentes
    let allSchedulings = [];
    for (const scheduling of schedulingData) {
      const recurrentSchedulings = generateRecurrentSchedulings(scheduling);
      allSchedulings = [...allSchedulings, ...recurrentSchedulings];
    }

    // Verificar limite de segurança no total de agendamentos
    const TOTAL_LIMIT = 50;
    if (allSchedulings.length > TOTAL_LIMIT) {
      throw new Error(
        `Safety limit exceeded: attempting to create ${allSchedulings.length} schedulings at once. Maximum allowed is ${TOTAL_LIMIT}.`,
      );
    }

    // Iniciar uma transação
    transaction = await sequelize.transaction();
    const createdSchedulings = [];

    // Processar cada agendamento no array expandido
    for (const scheduling of allSchedulings) {
      // Preparar os dados para o repositório (remover frequency e endCondition)
      const data = { ...scheduling };
      delete data.frequency;
      delete data.endCondition;

      // Criar o agendamento
      const newScheduling = await SchedulingRepository.createScheduling({
        schedulingData: data,
        transaction,
      });

      if (!newScheduling) {
        throw new Error('Failed to create scheduling');
      }

      // Obter os detalhes completos do agendamento criado
      const completeScheduling = await SchedulingRepository.getSchedulingById({
        id: newScheduling.id,
        transaction,
      });

      createdSchedulings.push(completeScheduling);
    }

    // Commit da transação se tudo deu certo
    await transaction.commit();
    return createdSchedulings;
  } catch (error) {
    // Rollback da transação em caso de erro
    if (transaction) await transaction.rollback();
    throw new Error(`Service error: ${error.message}`);
  }
};

const getAllSchedulings = async ({ date, status }) => {
  try {
    return await SchedulingRepository.getAllSchedulings({ date, status });
  } catch (error) {
    throw new Error(`Error getting schedulings: ${error.message}`);
  }
};

const getSchedulingsByClinic = async ({ clinicId, date, status }) => {
  try {
    return await SchedulingRepository.getSchedulingsByClinic({ clinicId, date, status });
  } catch (error) {
    throw new Error(`Error getting schedulings by clinic: ${error.message}`);
  }
};

const getSchedulingsByPetOwner = async ({ petOwnerId, date, status }) => {
  try {
    return await SchedulingRepository.getSchedulingsByPetOwner({ petOwnerId, date, status });
  } catch (error) {
    throw new Error(`Error getting schedulings by pet owner: ${error.message}`);
  }
};

const getSchedulingsByPet = async ({ petId, date, status }) => {
  try {
    return await SchedulingRepository.getSchedulingsByPet({ petId, date, status });
  } catch (error) {
    throw new Error(`Error getting schedulings by pet: ${error.message}`);
  }
};

const getSchedulingById = async ({ id }) => {
  try {
    const scheduling = await SchedulingRepository.getSchedulingById({ id });

    if (!scheduling) {
      throw new Error('Scheduling not found');
    }

    return scheduling;
  } catch (error) {
    throw new Error(`Error getting scheduling by id: ${error.message}`);
  }
};

const updateScheduling = async ({ id, schedulingData }) => {
  try {
    return await SchedulingRepository.updateScheduling({ id, schedulingData });
  } catch (error) {
    throw new Error(`Error updating scheduling: ${error.message}`);
  }
};

const cancelScheduling = async ({ id }) => {
  try {
    // Supondo que há um ID de status para "cancelado"
    const CANCELED_STATUS_ID = 'ID_DO_STATUS_CANCELADO';

    return await SchedulingRepository.updateScheduling({
      id,
      schedulingData: {
        scheduling_status_id: CANCELED_STATUS_ID,
      },
    });
  } catch (error) {
    throw new Error(`Error canceling scheduling: ${error.message}`);
  }
};

const confirmScheduling = async ({ id }) => {
  try {
    return await SchedulingRepository.updateScheduling({
      id,
      schedulingData: {
        is_confirmed: true,
      },
    });
  } catch (error) {
    throw new Error(`Error confirming scheduling: ${error.message}`);
  }
};

const deleteScheduling = async ({ id }) => {
  try {
    return await SchedulingRepository.deleteScheduling({ id });
  } catch (error) {
    throw new Error(`Error deleting scheduling: ${error.message}`);
  }
};

export default {
  createScheduling,
  getAllSchedulings,
  getSchedulingsByClinic,
  getSchedulingsByPetOwner,
  getSchedulingsByPet,
  getSchedulingById,
  updateScheduling,
  cancelScheduling,
  confirmScheduling,
  deleteScheduling,
};
