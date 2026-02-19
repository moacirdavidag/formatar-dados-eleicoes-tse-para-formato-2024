import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import logger from '../logger.config.js';

const mapearCSVJSON = (path_arquivo_entrada, path_arquivo_saida, ano_eleicao, abrangencia) => {
    try {
        logger.info(`[Mapeamento CSV-JSON] Iniciando o mapeamento CSV para JSON...`);

        if (!ano_eleicao) {
            throw new Error('O ano da eleição não foi informado!');
        }

        if(!abrangencia) {
            throw new Error('A abrangência da eleição não foi informada!');
        }

        logger.info(`Eleição ${ano_eleicao} - Abrangência: ${abrangencia}`);
    } catch (error) {
        logger.error(`[Mapeamento CSV-JSON]: ${error.message}`)
        throw error;
    }
}

export default mapearCSVJSON;