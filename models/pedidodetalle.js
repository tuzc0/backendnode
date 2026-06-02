'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class pedidodetalle extends Model {
    static associate(models) {
      pedidodetalle.belongsTo(models.pedido, { foreignKey: 'pedidoid', as: 'pedido' });
    }
  }

  pedidodetalle.init({
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    pedidoid: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    productoid: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    titulo: {
      type: DataTypes.STRING,
      allowNull: false
    },
    preciounitario: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    cantidad: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    }
  }, {
    sequelize,
    freezeTableName: true,
    modelName: 'pedidodetalle'
  });

  return pedidodetalle;
};
