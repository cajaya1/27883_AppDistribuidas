#!/usr/bin/env python3
# sin_hilos/client.py
# Cliente interactivo para el servidor de calificaciones

import socket
import json

HOST = 'localhost'
PORT = 12345
BUFFER_SIZE = 4096

def mostrar_menu():
    print("\n--- Menú de Calificaciones ---")
    print("1. Agregar calificación")
    print("2. Buscar por ID")
    print("3. Actualizar calificación")
    print("4. Listar todas")
    print("5. Eliminar por ID")
    print("6. Salir")
    try:
        return int(input("Elija opción: ").strip())
    except:
        return -1

def enviar_comando(comando):
    client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    client_socket.connect((HOST, PORT))
    client_socket.send(comando.encode('utf-8'))
    respuesta = client_socket.recv(BUFFER_SIZE).decode('utf-8')
    client_socket.close()
    try:
        return json.loads(respuesta)
    except:
        return {"status": "error", "mensaje": "Respuesta no JSON"}

def main():
    while True:
        opcion = mostrar_menu()
        if opcion == 1:
            id_est = input("ID: ").strip()
            nombre = input("Nombre: ").strip()
            materia = input("Materia (ej. MAT101): ").strip()
            calif = input("Calificación (0-20): ").strip()
            cmd = f"AGREGAR|{id_est}|{nombre}|{materia}|{calif}"
            res = enviar_comando(cmd)
            print(res.get('mensaje', res))
        elif opcion == 2:
            id_est = input("ID: ").strip()
            cmd = f"BUSCAR|{id_est}"
            res = enviar_comando(cmd)
            if res.get('status') == 'ok':
                d = res['data']
                print(f"Nombre: {d.get('Nombre')}, Materia: {d.get('Materia')}, Calif: {d.get('Calificacion')}")
            else:
                print(res.get('mensaje', res))
        elif opcion == 3:
            id_est = input("ID: ").strip()
            nueva_calif = input("Nueva calificación: ").strip()
            cmd = f"ACTUALIZAR|{id_est}|{nueva_calif}"
            res = enviar_comando(cmd)
            print(res.get('mensaje', res))
        elif opcion == 4:
            cmd = "LISTAR"
            res = enviar_comando(cmd)
            if res.get('status') == 'ok':
                for row in res['data']:
                    print(row)
            else:
                print(res.get('mensaje', res))
        elif opcion == 5:
            id_est = input("ID: ").strip()
            cmd = f"ELIMINAR|{id_est}"
            res = enviar_comando(cmd)
            print(res.get('mensaje', res))
        elif opcion == 6:
            print("Saliendo...")
            break
        else:
            print("Opción inválida. Intente otra vez.")

if __name__ == '__main__':
    main()
