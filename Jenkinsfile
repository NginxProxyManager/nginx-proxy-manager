import groovy.transform.Field

@Field
def shOutput = ""
def buildxPushTags = ""

pipeline {
	agent {
		label 'docker-multiarch'
	}
	options {
		buildDiscarder(logRotator(numToKeepStr: '5'))
		disableConcurrentBuilds()
		ansiColor('xterm')
	}
	environment {
		IMAGE                      = 'nginx-proxy-manager'
		BUILD_VERSION              = getVersion()
		MAJOR_VERSION              = '2'
		BRANCH_LOWER               = "${BRANCH_NAME.toLowerCase().replaceAll('\\\\', '-').replaceAll('/', '-').replaceAll('\\.', '-')}"
		BUILDX_NAME                = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}"
		COMPOSE_INTERACTIVE_NO_CLI = 1
	}
	stages {
		stage('Environment') {
			parallel {
				stage('Master') {
					when {
						branch 'master'
					}
					steps {
						script {
							buildxPushTags = "-t docker.io/jc21/${IMAGE}:${BUILD_VERSION} -t docker.io/jc21/${IMAGE}:${MAJOR_VERSION} -t docker.io/jc21/${IMAGE}:latest"
						}
					}
				}
				stage('Other') {
					when {
						not {
							branch 'master'
						}
					}
					steps {
						script {
							// Defaults to the Branch name, which is applies to all branches AND pr's
							buildxPushTags = "-t docker.io/nginxproxymanager/${IMAGE}-dev:${BRANCH_LOWER}"
						}
					}
				}
				stage('Versions') {
					steps {
						sh 'cat frontend/package.json | jq --arg BUILD_VERSION "${BUILD_VERSION}" \'.version = $BUILD_VERSION\' | sponge frontend/package.json'
						sh 'echo -e "\\E[1;36mFrontend Version is:\\E[1;33m $(cat frontend/package.json | jq -r .version)\\E[0m"'
						sh 'cat backend/package.json | jq --arg BUILD_VERSION "${BUILD_VERSION}" \'.version = $BUILD_VERSION\' | sponge backend/package.json'
						sh 'echo -e "\\E[1;36mBackend Version is:\\E[1;33m  $(cat backend/package.json | jq -r .version)\\E[0m"'
						sh 'sed -i -E "s/(version-)[0-9]+\\.[0-9]+\\.[0-9]+(-green)/\\1${BUILD_VERSION}\\2/" README.md'
					}
				}
				stage('Docker Login') {
					steps {
						withCredentials([usernamePassword(credentialsId: 'jc21-dockerhub', passwordVariable: 'dpass', usernameVariable: 'duser')]) {
							sh 'docker login -u "${duser}" -p "${dpass}"'
						}
					}
				}
			}
		}
		stage('Builds') {
			parallel {
				stage('Project') {
					steps {
						script {
							// Frontend and Backend
							def shStatusCode = sh(label: 'Checking and Building', returnStatus: true, script: '''
								set -e
								./scripts/ci/frontend-build > ${WORKSPACE}/tmp-sh-build 2>&1
								./scripts/ci/test-and-build > ${WORKSPACE}/tmp-sh-build 2>&1
							''')
							shOutput = readFile "${env.WORKSPACE}/tmp-sh-build"
							if (shStatusCode != 0) {
								error "${shOutput}"
							}
						}
					}
					post {
						always {
							sh 'rm -f ${WORKSPACE}/tmp-sh-build'
						}
						failure {
							npmGithubPrComment("CI Error:\n\n```\n${shOutput}\n```", true)
						}
					}
				}
				stage('Docs') {
					steps {
						dir(path: 'docs') {
							sh 'yarn install'
							sh 'yarn build'
						}
					}
				}
			}
		}
		stage('Test Sqlite') {
			environment {
				COMPOSE_PROJECT_NAME = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}_sqlite"
				COMPOSE_FILE         = 'docker/docker-compose.ci.yml:docker/docker-compose.ci.sqlite.yml'
			}
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				sh 'rm -rf ./test/results/junit/*'
				sh './scripts/ci/fulltest-cypress'
			}
			post {
				always {
					// Dumps to analyze later
					sh 'mkdir -p debug/sqlite'
					sh 'docker logs $(docker-compose ps --all -q fullstack) > debug/sqlite/docker_fullstack.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q stepca) > debug/sqlite/docker_stepca.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns) > debug/sqlite/docker_pdns.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns-db) > debug/sqlite/docker_pdns-db.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q dnsrouter) > debug/sqlite/docker_dnsrouter.log 2>&1'
					junit 'test/results/junit/*'
					sh 'docker-compose down --remove-orphans --volumes -t 30 || true'
				}
				unstable {
					dir(path: 'test/results') {
						archiveArtifacts(allowEmptyArchive: true, artifacts: '**/*', excludes: '**/*.xml')
					}
				}
			}
		}
		stage('Test Mysql') {
			environment {
				COMPOSE_PROJECT_NAME = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}_mysql"
				COMPOSE_FILE         = 'docker/docker-compose.ci.yml:docker/docker-compose.ci.mysql.yml'
			}
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				sh 'rm -rf ./test/results/junit/*'
				sh './scripts/ci/fulltest-cypress'
			}
			post {
				always {
					// Dumps to analyze later
					sh 'mkdir -p debug/mysql'
					sh 'docker logs $(docker-compose ps --all -q fullstack) > debug/mysql/docker_fullstack.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q stepca) > debug/mysql/docker_stepca.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns) > debug/mysql/docker_pdns.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns-db) > debug/mysql/docker_pdns-db.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q dnsrouter) > debug/mysql/docker_dnsrouter.log 2>&1'
					junit 'test/results/junit/*'
					sh 'docker-compose down --remove-orphans --volumes -t 30 || true'
				}
				unstable {
					dir(path: 'test/results') {
						archiveArtifacts(allowEmptyArchive: true, artifacts: '**/*', excludes: '**/*.xml')
					}
				}
			}
		}
		stage('Test Postgres') {
			environment {
				COMPOSE_PROJECT_NAME = "npm_${BRANCH_LOWER}_${BUILD_NUMBER}_postgres"
				COMPOSE_FILE         = 'docker/docker-compose.ci.yml:docker/docker-compose.ci.postgres.yml'
			}
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				sh 'rm -rf ./test/results/junit/*'
				sh './scripts/ci/fulltest-cypress'
			}
			post {
				always {
					// Dumps to analyze later
					sh 'mkdir -p debug/postgres'
					sh 'docker logs $(docker-compose ps --all -q fullstack) > debug/postgres/docker_fullstack.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q stepca) > debug/postgres/docker_stepca.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns) > debug/postgres/docker_pdns.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q pdns-db) > debug/postgres/docker_pdns-db.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q dnsrouter) > debug/postgres/docker_dnsrouter.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q db-postgres) > debug/postgres/docker_db-postgres.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q authentik) > debug/postgres/docker_authentik.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q authentik-redis) > debug/postgres/docker_authentik-redis.log 2>&1'
					sh 'docker logs $(docker-compose ps --all -q authentik-ldap) > debug/postgres/docker_authentik-ldap.log 2>&1'

					junit 'test/results/junit/*'
					sh 'docker-compose down --remove-orphans --volumes -t 30 || true'
				}
				unstable {
					dir(path: 'test/results') {
						archiveArtifacts(allowEmptyArchive: true, artifacts: '**/*', excludes: '**/*.xml')
					}
				}
			}
		}
		stage('MultiArch Build') {
			when {
				not {
					equals expected: 'UNSTABLE', actual: currentBuild.result
				}
			}
			steps {
				sh "./scripts/buildx --push ${buildxPushTags}"
			}
		}
		stage('Docs / Comment') {
			parallel {
				stage('Docs Job') {
					when {
						allOf {
							branch pattern: "^(develop|master)\$", comparator: "REGEXP"
							not {
								equals expected: 'UNSTABLE', actual: currentBuild.result
							}
						}
					}
					steps {
						build wait: false, job: 'nginx-proxy-manager-docs', parameters: [string(name: 'docs_branch', value: "$BRANCH_NAME")]
					}
				}
				stage('PR Comment') {
					when {
						allOf {
							changeRequest()
							not {
								equals expected: 'UNSTABLE', actual: currentBuild.result
							}
						}
					}
					steps {
						script {
							npmGithubPrComment("""Docker Image for build ${BUILD_NUMBER} is available on
[DockerHub](https://cloud.docker.com/repository/docker/nginxproxymanager/${IMAGE}-dev)
as `nginxproxymanager/${IMAGE}-dev:${BRANCH_LOWER}`

**Note:** ensure you backup your NPM instance before testing this image! Especially if there are database changes
**Note:** this is a different docker image namespace than the official image
""", true)
						}
					}
				}
			}
		}
	}
	post {
		always {
			sh 'echo Reverting ownership'
			sh 'docker run --rm -v "$(pwd):/data" jc21/ci-tools chown -R "$(id -u):$(id -g)" /data'
			printResult(true)
		}
		failure {
			archiveArtifacts(artifacts: 'debug/**/*.*', allowEmptyArchive: true)
		}
		unstable {
			archiveArtifacts(artifacts: 'debug/**/*.*', allowEmptyArchive: true)
		}
	}
}

def getVersion() {
	ver = sh(script: 'cat .version', returnStdout: true)
	return ver.trim()
}

def getCommit() {
	ver = sh(script: 'git log -n 1 --format=%h', returnStdout: true)
	return ver.trim()
}
